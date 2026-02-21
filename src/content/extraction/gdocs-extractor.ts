import { countUnits, detectLangMode } from '../../shared/segmentation'
import type { ExtractedContent, TextBlock, TextNodeRef } from './types'

function pickRoot(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.kix-wordhtmlgenerator-word-node')).filter(
    (el): el is HTMLElement => el instanceof HTMLElement
  )
}

export async function extractGDocs(): Promise<ExtractedContent> {
  const title = document.title || 'Google Docs'
  const nodesEls = pickRoot()
  if (nodesEls.length === 0) {
    return {
      title,
      blocks: [],
      fullText: '',
      langMode: 'space',
      totalChars: 0,
      totalWords: 0,
      totalUnits: 0,
      siteType: 'gdocs',
      degraded: true
    }
  }

  const blocks: TextBlock[] = []
  let blockIndex = 0
  let fullTextParts: string[] = []

  for (const el of nodesEls) {
    const text = (el.innerText || '').trim()
    if (!text) continue

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const nodes: TextNodeRef[] = []
    let totalChars = 0
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!(n instanceof Text)) continue
      const raw = n.nodeValue ?? ''
      if (!raw.trim()) continue
      nodes.push({
        text: raw,
        textNode: n,
        element: el,
        charCount: raw.length,
        wordCount: 0,
        unitCount: 0,
        charOffset: totalChars
      })
      totalChars += raw.length
    }
    if (nodes.length === 0) continue

    blocks.push({
      id: `gd${blockIndex++}`,
      nodes,
      element: el,
      totalChars,
      totalWords: 0,
      totalUnits: 0
    })
    fullTextParts.push(text)
  }

  const fullText = fullTextParts.join('\n\n')
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
    siteType: 'gdocs',
    degraded: false
  }
}
