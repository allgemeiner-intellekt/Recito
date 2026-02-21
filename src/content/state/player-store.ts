import { create } from 'zustand'

import type { ExtensionMessage } from '../../shared/messages'
import type { LangMode, TTSSettings } from '../../shared/types'
import { runtimeSendMessage } from '../../shared/chrome-async'
import type { ExtractedContent } from '../extraction/types'
import { createHighlighter, type HighlighterHandle } from '../highlighting/highlighter'
import { createSyncController, type SyncController } from '../highlighting/sync-controller'
import { ScrollManager } from '../highlighting/scroll-manager'

export interface ChunkMetaLite {
  index: number
  startUnitIndex: number
  endUnitIndex: number
  unitCount: number
}

interface PlaybackUpdate {
  jobId: string
  globalTime: number
  chunkIndex: number
  isPlaying: boolean
  duration: number
  playbackRate: number
}

interface PlayerState {
  jobId: string | null
  langMode: LangMode

  isPlaying: boolean
  isLoading: boolean
  error: string | null

  currentTime: number
  totalDuration: number
  currentChunkIndex: number
  totalChunks: number
  playbackRate: number

  settings: TTSSettings | null

  isVisible: boolean
  isMinimized: boolean

  extractedContent: ExtractedContent | null
  chunkMetaByIndex: Map<number, ChunkMetaLite>
  chunkDurations: Map<number, number>

  highlighter: HighlighterHandle | null
  sync: SyncController | null
  scrollManager: ScrollManager | null

  setJobId: (jobId: string | null) => void
  setSettings: (settings: TTSSettings) => void
  setExtractedContent: (content: ExtractedContent) => void
  setVisible: (visible: boolean) => void
  setMinimized: (min: boolean) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setPlaybackRate: (rate: number) => void
  setTotalChunks: (n: number) => void
  onChunkReady: (chunkIndex: number, totalChunks: number, chunkMeta: unknown) => void
  onPlaybackState: (update: PlaybackUpdate) => void

  play: () => Promise<void>
  pause: () => Promise<void>
  stop: () => Promise<void>
  seekBy: (deltaSeconds: number) => Promise<void>
  seekTo: (time: number) => Promise<void>
  setRate: (playbackRate: number) => Promise<void>
}

function sumDurations(durations: Map<number, number>, beforeChunk: number): number {
  let t = 0
  for (let i = 0; i < beforeChunk; i++) t += durations.get(i) ?? 0
  return t
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  jobId: null,
  langMode: 'space',
  isPlaying: false,
  isLoading: false,
  error: null,
  currentTime: 0,
  totalDuration: 0,
  currentChunkIndex: 0,
  totalChunks: 0,
  playbackRate: 1,
  settings: null,
  isVisible: false,
  isMinimized: false,
  extractedContent: null,
  chunkMetaByIndex: new Map(),
  chunkDurations: new Map(),
  highlighter: null,
  sync: null,
  scrollManager: null,

  setJobId: (jobId) => set({ jobId }),
  setSettings: (settings) => set({ settings }),
  setVisible: (isVisible) => set({ isVisible }),
  setMinimized: (isMinimized) => set({ isMinimized }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setPlaybackRate: (playbackRate) => set({ playbackRate }),
  setTotalChunks: (totalChunks) => set({ totalChunks }),

  setExtractedContent: (content) => {
    const prev = get()
    prev.sync?.destroy()
    prev.highlighter?.cleanup()
    prev.scrollManager?.destroy()

    const settings = prev.settings
    let highlighter: HighlighterHandle | null = null
    let sync: SyncController | null = null
    let scrollManager: ScrollManager | null = null

    if (settings?.highlightWord || settings?.highlightSentence) {
      highlighter = createHighlighter({
        content,
        highlightWord: !!settings?.highlightWord,
        highlightSentence: !!settings?.highlightSentence,
        maxUnits: 12000
      })
      if (highlighter) {
        scrollManager = new ScrollManager(() => get().settings?.autoScroll ?? true)
        sync = createSyncController(highlighter, scrollManager)
      }
    }

    set({
      extractedContent: content,
      langMode: content.langMode,
      highlighter,
      sync,
      scrollManager
    })
  },

  onChunkReady: (chunkIndex, totalChunks, chunkMeta) => {
    const meta = chunkMeta as ChunkMetaLite
    const map = new Map(get().chunkMetaByIndex)
    map.set(chunkIndex, meta)
    set({ chunkMetaByIndex: map, totalChunks })
  },

  onPlaybackState: (update) => {
    const state = get()
    if (state.jobId && update.jobId !== state.jobId) return

    const chunkDurations = new Map(state.chunkDurations)
    if (Number.isFinite(update.duration) && update.duration > 0) chunkDurations.set(update.chunkIndex, update.duration)

    const totalKnown = sumDurations(chunkDurations, update.chunkIndex) + (chunkDurations.get(update.chunkIndex) ?? 0)

    set({
      isPlaying: update.isPlaying,
      currentTime: update.globalTime,
      currentChunkIndex: update.chunkIndex,
      chunkDurations,
      totalDuration: Math.max(state.totalDuration, totalKnown),
      playbackRate: update.playbackRate
    })

    // Drive highlighting.
    const chunkMeta = state.chunkMetaByIndex.get(update.chunkIndex)
    const duration = chunkDurations.get(update.chunkIndex) ?? update.duration
    if (state.sync && chunkMeta && duration > 0) {
      const prevSum = sumDurations(chunkDurations, update.chunkIndex)
      const chunkTime = Math.max(0, update.globalTime - prevSum)
      state.sync.update({
        chunkIndex: update.chunkIndex,
        chunkTime,
        chunkDuration: duration,
        chunkMeta
      })
    }
  },

  play: async () => {
    const jobId = get().jobId
    if (!jobId) return
    await runtimeSendMessage({ type: 'PLAYBACK_CONTROL', payload: { jobId, action: 'play' } } satisfies ExtensionMessage)
  },
  pause: async () => {
    const jobId = get().jobId
    if (!jobId) return
    await runtimeSendMessage({ type: 'PLAYBACK_CONTROL', payload: { jobId, action: 'pause' } } satisfies ExtensionMessage)
  },
  stop: async () => {
    const { jobId, highlighter, sync, scrollManager } = get()
    if (!jobId) return
    await runtimeSendMessage({ type: 'TTS_CANCEL', payload: { jobId } } satisfies ExtensionMessage)
    sync?.destroy()
    highlighter?.cleanup()
    scrollManager?.destroy()
    set({
      jobId: null,
      isPlaying: false,
      isLoading: false,
      error: null,
      currentTime: 0,
      totalDuration: 0,
      currentChunkIndex: 0,
      totalChunks: 0,
      chunkMetaByIndex: new Map(),
      chunkDurations: new Map(),
      extractedContent: null,
      isVisible: false
    })
  },
  seekBy: async (deltaSeconds) => {
    const { jobId, currentTime } = get()
    if (!jobId) return
    await runtimeSendMessage({
      type: 'PLAYBACK_CONTROL',
      payload: { jobId, action: 'seek', value: Math.max(0, currentTime + deltaSeconds) }
    } satisfies ExtensionMessage)
  },
  seekTo: async (time) => {
    const jobId = get().jobId
    if (!jobId) return
    await runtimeSendMessage({
      type: 'PLAYBACK_CONTROL',
      payload: { jobId, action: 'seek', value: Math.max(0, time) }
    } satisfies ExtensionMessage)
  },
  setRate: async (playbackRate) => {
    const jobId = get().jobId
    if (!jobId) return
    set({ playbackRate })
    await runtimeSendMessage({
      type: 'PLAYBACK_CONTROL',
      payload: { jobId, action: 'setPlaybackRate', value: playbackRate }
    } satisfies ExtensionMessage)
  }
}))
