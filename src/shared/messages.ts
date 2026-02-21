import type { LangMode, PlaybackControlAction } from './types'

export type ExtensionMessage =
  | {
      type: 'TTS_REQUEST'
      payload: {
        jobId: string
        text: string
        voice: string
        model: string
        responseFormat: string
        langMode: LangMode
        initialPlaybackRate: number
        tabId?: number
      }
    }
  | { type: 'TTS_CANCEL'; payload: { jobId: string } }
  | {
      type: 'PLAYBACK_CONTROL'
      payload: { jobId: string; action: PlaybackControlAction; value?: number }
    }
  | { type: 'GET_PLAYBACK_STATE'; payload: { jobId?: string } }
  | { type: 'TTS_STARTED'; payload: { jobId: string } }
  | {
      type: 'TTS_CHUNK_READY'
      payload: { jobId: string; chunkIndex: number; totalChunks: number; chunkMeta: unknown }
    }
  | { type: 'TTS_COMPLETE'; payload: { jobId: string; totalChunks: number } }
  | { type: 'TTS_ERROR'; payload: { jobId: string; error: string; chunkIndex?: number } }
  | {
      type: 'PLAYBACK_STATE_UPDATE'
      payload: {
        jobId: string
        globalTime: number
        chunkIndex: number
        isPlaying: boolean
        duration: number
        playbackRate: number
      }
    }
  | {
      type: 'AUDIO_LOAD_CHUNK'
      payload: { jobId: string; chunkIndex: number; audioData: ArrayBuffer; totalChunks: number }
    }
  | { type: 'AUDIO_PLAY'; payload: { jobId: string } }
  | { type: 'AUDIO_PAUSE'; payload: { jobId: string } }
  | { type: 'AUDIO_SEEK'; payload: { jobId: string; globalTime: number } }
  | { type: 'AUDIO_SET_PLAYBACK_RATE'; payload: { jobId: string; playbackRate: number } }
  | { type: 'AUDIO_STOP'; payload: { jobId: string } }
  | {
      type: 'AUDIO_TIME_UPDATE'
      payload: { jobId: string; chunkIndex: number; currentTime: number; duration: number; isPlaying: boolean }
    }
  | { type: 'AUDIO_ENDED'; payload: { jobId: string } }
  | { type: 'CHUNK_DURATION_KNOWN'; payload: { jobId: string; chunkIndex: number; duration: number } }
  | { type: 'START_PAGE_READING'; payload: { tabId: number } }
  | { type: 'GET_PAGE_INFO'; payload: { tabId: number } }
  | { type: 'PAGE_INFO_RESPONSE'; payload: { wordCount: number; unitCount: number; langMode: LangMode } }

export function isExtensionMessage(msg: unknown): msg is ExtensionMessage {
  return !!msg && typeof msg === 'object' && 'type' in msg
}

