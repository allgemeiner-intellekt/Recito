import type { ExtensionMessage } from '../shared/messages'
import { isExtensionMessage } from '../shared/messages'
import { detectLangMode } from '../shared/segmentation'
import { getSettings } from '../shared/storage'
import { runtimeSendMessage } from '../shared/chrome-async'
import { BASE_UPM_CJK, BASE_UPM_SPACE } from '../shared/constants'
import type { LangMode } from '../shared/types'
import { extractContent } from './extraction/extractor'
import { usePlayerStore } from './state/player-store'

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function rateToPlaybackRate(rateUPM: number, langMode: LangMode): number {
  const base = langMode === 'space' ? BASE_UPM_SPACE : BASE_UPM_CJK
  return clamp(rateUPM / base, 0.5, 3.0)
}

export function initContentMessaging(): void {
  // Best-effort cleanup on navigation/unload.
  window.addEventListener('pagehide', () => {
    const state = usePlayerStore.getState()
    const jobId = state.jobId
    state.sync?.destroy()
    state.highlighter?.cleanup()
    state.scrollManager?.destroy()
    if (jobId) void runtimeSendMessage({ type: 'TTS_CANCEL', payload: { jobId } } satisfies ExtensionMessage)
  })

  chrome.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse) => {
    if (!isExtensionMessage(raw)) return
    const msg = raw as ExtensionMessage

    const store = usePlayerStore.getState()

    switch (msg.type) {
      case 'GET_PAGE_INFO': {
        ;(async () => {
          try {
            const extracted = await extractContent()
            const langMode = extracted.langMode ?? detectLangMode(extracted.fullText, document.documentElement.lang)
            sendResponse({
              type: 'PAGE_INFO_RESPONSE',
              payload: { wordCount: extracted.totalWords, unitCount: extracted.totalUnits, langMode }
            } satisfies ExtensionMessage)
          } catch {
            sendResponse({ type: 'PAGE_INFO_RESPONSE', payload: { wordCount: 0, unitCount: 0, langMode: 'space' } })
          }
        })()
        return true
      }

      case 'START_PAGE_READING': {
        void (async () => {
          const settings = await getSettings()
          store.setSettings(settings)

          store.setVisible(true)
          store.setLoading(true)

          const extracted = await extractContent()
          store.setExtractedContent(extracted)

          const playbackRate = rateToPlaybackRate(settings.rateUPM, extracted.langMode)
          store.setPlaybackRate(playbackRate)

          const jobId = crypto.randomUUID()
          store.setJobId(jobId)

          await runtimeSendMessage({
            type: 'TTS_REQUEST',
            payload: {
              jobId,
              text: extracted.fullText,
              voice: settings.selectedVoice,
              model: settings.ttsModel,
              responseFormat: settings.responseFormat,
              langMode: extracted.langMode,
              initialPlaybackRate: playbackRate
            }
          } satisfies ExtensionMessage)
        })().catch((err) => {
          store.setLoading(false)
          store.setError(err instanceof Error ? err.message : String(err))
        })
        sendResponse({ ok: true })
        return
      }

      case 'TTS_STARTED': {
        store.setLoading(true)
        return
      }

      case 'TTS_CHUNK_READY': {
        store.onChunkReady(msg.payload.chunkIndex, msg.payload.totalChunks, msg.payload.chunkMeta)
        return
      }

      case 'TTS_COMPLETE': {
        store.setLoading(false)
        store.setTotalChunks(msg.payload.totalChunks)
        return
      }

      case 'TTS_ERROR': {
        store.setLoading(false)
        store.setError(msg.payload.error)
        return
      }

      case 'PLAYBACK_STATE_UPDATE': {
        store.onPlaybackState(msg.payload)
        return
      }

      default:
        return
    }
  })
}
