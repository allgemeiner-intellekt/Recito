import { countUnits, detectLangMode } from '../../shared/segmentation'
import type { ExtractedContent, TextBlock, TextNodeRef } from './types'

function pickGmailRoot(): HTMLElement | null {
  const roots = Array.from(document.querySelectorAll('div.a3s.aiL')).filter(
    (el): el is HTMLElement => el instanceof HTMLElement
  )
  if (roots.length === 0) return null
  return roots[roots.length - 1]!
}

function toBlocks(root: HTMLElement): TextBlock[] {
  const nodes: TextNodeRef[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let totalChars = 0
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!(n instanceof Text)) continue
    const raw = n.nodeValue ?? ''
    if (!raw.trim()) continue
    nodes.push({
      text: raw,
      textNode: n,
      element: root,
      charCount: raw.length,
      wordCount: 0,
      unitCount: 0,
      charOffset: totalChars
    })
    totalChars += raw.length
  }

  if (nodes.length === 0) return []
  return [
    {
      id: 'gmail',
      nodes,
      element: root,
      totalChars,
      totalWords: 0,
      totalUnits: 0
    }
  ]
}

export async function extractGmail(): Promise<ExtractedContent> {
  const title = document.title || 'Gmail'
  const root = pickGmailRoot()
  if (!root) {
    return {
      title,
      blocks: [],
      fullText: '',
      langMode: 'space',
      totalChars: 0,
      totalWords: 0,
      totalUnits: 0,
      siteType: 'gmail',
      degraded: true
    }
  }

  const blocks = toBlocks(root)
  const fullText = blocks.map((b) => b.nodes.map((n) => n.text).join('')).join('\n\n').trim()
  const langMode = detectLangMode(fullText, document.documentElement.lang)
  const totalUnits = countUnits(fullText, langMode, document.documentElement.lang)
  const totalWords = langMode === 'space' ? totalUnits : 0

  return {
    title,
    blocks,
    fullText,
    langMode,
    totalChars: fullText.length,
    totalWords,
    totalUnits,
    siteType: 'gmail',
    degraded: false
  }
}
