import type { LangMode, SiteType } from '../../shared/types'

export interface TextNodeRef {
  text: string
  textNode: Text
  element: HTMLElement
  charCount: number
  wordCount: number
  unitCount: number
  charOffset: number
}

export interface TextBlock {
  id: string
  nodes: TextNodeRef[]
  element: HTMLElement
  totalChars: number
  totalWords: number
  totalUnits: number
}

export interface ExtractedContent {
  title: string
  blocks: TextBlock[]
  fullText: string
  langMode: LangMode
  totalChars: number
  totalWords: number
  totalUnits: number
  siteType: SiteType
  degraded: boolean
}

