export type LangMode = 'space' | 'cjk'

export type SiteType = 'generic' | 'gmail' | 'gdocs'

export type PlaybackControlAction = 'play' | 'pause' | 'seek' | 'setPlaybackRate' | 'stop'

export interface TTSSettings {
  apiEndpoint: string
  apiKey: string
  ttsModel: string
  selectedVoice: string
  rateUPM: number
  responseFormat: 'mp3' | 'wav' | 'opus' | string
  autoScroll: boolean
  highlightWord: boolean
  highlightSentence: boolean
}

export interface PageInfo {
  title: string
  wordCount: number
  unitCount: number
  langMode: LangMode
}

