import { Readability } from '@mozilla/readability'

import { countUnits, detectLangMode } from '../../shared/segmentation'
import type { ExtractedContent, TextBlock, TextNodeRef } from './types'

function isVisible(el: Element): boolean {
  const style = window.getComputedStyle(el)
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0'
}

function isBoilerplateTag(tagName: string): boolean {
  return ['NAV', 'HEADER', 'FOOTER', 'ASIDE', 'FORM', 'NOSCRIPT'].includes(tagName)
}

function scoreContainer(el: HTMLElement): number {
  if (!isVisible(el)) return -1
  if (isBoilerplateTag(el.tagName)) return -1

  const text = (el.innerText || '').trim()
  if (text.length < 400) return -1

  let linkTextLen = 0
  for (const a of Array.from(el.querySelectorAll('a'))) {
    linkTextLen += (a.innerText || '').trim().length
  }

  const visibleTextLen = text.length
  const score = visibleTextLen - linkTextLen * 2
  return score
}

function pickRoot(): HTMLElement | null {
  const preferred = document.querySelector('article, main')
  if (preferred instanceof HTMLElement && scoreContainer(preferred) > 0) return preferred

  const candidates = Array.from(document.querySelectorAll('article, main, section, div'))
    .filter((el): el is HTMLElement => el instanceof HTMLElement)
    .slice(0, 800)

  let best: HTMLElement | null = null
  let bestScore = -1
  for (const el of candidates) {
    const s = scoreContainer(el)
    if (s > bestScore) {
      bestScore = s
      best = el
    }
  }
  return bestScore > 0 ? best : null
}

function collectBlocks(root: HTMLElement): TextBlock[] {
  const blocks: TextBlock[] = []
  const els = Array.from(root.querySelectorAll('p, li, blockquote, h1, h2, h3')).filter(
    (el): el is HTMLElement => el instanceof HTMLElement
  )

  let blockIndex = 0
  let globalOffset = 0

  for (const el of els) {
    if (!isVisible(el)) continue
    if (el.closest('nav, header, footer, aside, form')) continue
    if (el.querySelector('code, pre')) continue

    const text = (el.innerText || '').trim()
    if (text.length < 40 && !/^H[1-3]$/.test(el.tagName)) continue

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const nodes: TextNodeRef[] = []
    let totalChars = 0
    let totalWords = 0
    let totalUnits = 0

    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!(n instanceof Text)) continue
      const raw = n.nodeValue ?? ''
      if (!raw.trim()) continue

      const nodeText = raw
      const charCount = nodeText.length
      nodes.push({
        text: nodeText,
        textNode: n,
        element: el,
        charCount,
        wordCount: 0,
        unitCount: 0,
        charOffset: globalOffset + totalChars
      })
      totalChars += charCount
    }

    if (nodes.length === 0) continue

    blocks.push({
      id: `b${blockIndex++}`,
      nodes,
      element: el,
      totalChars,
      totalWords,
      totalUnits
    })

    globalOffset += totalChars + 2 // roughly account for \n\n in fullText assembly
  }

  return blocks
}

export async function extractGeneric(): Promise<ExtractedContent> {
  const title = document.title || ''
  const root = pickRoot()

  // Root found: active DOM traversal (supports highlighting).
  if (root) {
    const blocks = collectBlocks(root)
    const fullText = blocks
      .map((b) => b.nodes.map((n) => n.text).join('').trim())
      .filter(Boolean)
      .join('\n\n')

    const langMode = detectLangMode(fullText, document.documentElement.lang)
    let totalWords = 0
    let totalUnits = 0
    for (const b of blocks) {
      const text = b.nodes.map((n) => n.text).join('')
      const units = countUnits(text, langMode, document.documentElement.lang)
      const words = langMode === 'space' ? units : 0
      b.totalWords = words
      b.totalUnits = units
      totalWords += words
      totalUnits += units
      for (const n of b.nodes) {
        n.unitCount = countUnits(n.text, langMode, document.documentElement.lang)
        n.wordCount = langMode === 'space' ? n.unitCount : 0
      }
    }

    return {
      title,
      blocks,
      fullText,
      langMode,
      totalChars: fullText.length,
      totalWords,
      totalUnits,
      siteType: 'generic',
      degraded: false
    }
  }

  // Fallback: Readability (no safe DOM mapping -> degraded mode).
  const clone = document.cloneNode(true) as Document
  const reader = new Readability(clone)
  const article = reader.parse()

  const fullText = (article?.textContent || '').trim()
  const langMode = detectLangMode(fullText, document.documentElement.lang)
  const totalUnits = countUnits(fullText, langMode, document.documentElement.lang)
  const totalWords = langMode === 'space' ? totalUnits : 0

  return {
    title: article?.title || title,
    blocks: [],
    fullText,
    langMode,
    totalChars: fullText.length,
    totalWords,
    totalUnits,
    siteType: 'generic',
    degraded: true
  }
}
