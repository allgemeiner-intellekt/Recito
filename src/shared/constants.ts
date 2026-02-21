import type { TTSSettings } from './types'

export const BASE_UPM_SPACE = 150
export const BASE_UPM_CJK = 300

export const DEFAULT_SETTINGS: TTSSettings = {
  apiEndpoint: '',
  apiKey: '',
  ttsModel: 'tts-1',
  selectedVoice: 'alloy',
  rateUPM: 200,
  responseFormat: 'mp3',
  autoScroll: true,
  highlightWord: true,
  highlightSentence: true
}

export const MAX_JOB_CHARS = 200_000
export const MAX_CHUNK_CHARS = 4000

export const MAX_BUFFER_AHEAD_CHUNKS = 2
export const MAX_BUFFER_BEHIND_CHUNKS = 1

