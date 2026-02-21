import { segmentText } from '../../shared/segmentation'
import type { ExtractedContent } from '../extraction/types'

export interface WrappedUnit {
  globalIndex: number
  element: HTMLSpanElement
  text: string
  sentenceIndex: number
}

export interface SentenceRange {
  sentenceIndex: number
  startUnitIndex: number
  endUnitIndex: number
}

export interface HighlighterHandle {
  highlightWord: boolean
  highlightSentence: boolean
  units: WrappedUnit[]
  sentenceRanges: SentenceRange[]
  cleanup: () => void
}

interface WrapRecord {
  parent: Node
  inserted: Node[]
  originalText: string
}

interface CreateHighlighterParams {
  content: ExtractedContent
  highlightWord: boolean
  highlightSentence: boolean
  maxUnits: number
}

function isSentenceBoundaryText(text: string): boolean {
  return /[.!?。！？]\s*$/.test(text) || /\n{2,}/.test(text)
}

export function createHighlighter(params: CreateHighlighterParams): HighlighterHandle | null {
  const { content, highlightWord, highlightSentence, maxUnits } = params
  if (!highlightWord && !highlightSentence) return null
  if (content.degraded) return null
  if (!content.blocks.length) return null

  // Rough cap: avoid freezing pages with too many segments.
  if (content.totalUnits > maxUnits) return null

  let globalIndex = 0
  let sentenceIndex = 0
  let currentSentenceStart = 0
  let sentenceBreakPending = false

  const units: WrappedUnit[] = []
  const sentenceRanges: SentenceRange[] = []
  const wrapRecords: WrapRecord[] = []

  const closeSentenceIfNeeded = (endUnitIndexExclusive: number) => {
    if (endUnitIndexExclusive <= currentSentenceStart) return
    sentenceRanges.push({
      sentenceIndex,
      startUnitIndex: currentSentenceStart,
      endUnitIndex: endUnitIndexExclusive - 1
    })
  }

  const scheduleSentenceBreak = () => {
    sentenceBreakPending = true
  }

  for (const block of content.blocks) {
    for (const nodeRef of block.nodes) {
      const textNode = nodeRef.textNode
      const parent = textNode.parentNode
      if (!parent) continue

      const raw = textNode.nodeValue ?? ''
      if (!raw) continue

      const tokens = segmentText(raw, content.langMode, document.documentElement.lang)
      if (tokens.length === 0) continue

      const inserted: Node[] = []
      const insertBefore = textNode

      for (const tok of tokens) {
        if (tok.kind === 'unit') {
          if (sentenceBreakPending) {
            closeSentenceIfNeeded(globalIndex)
            sentenceIndex++
            currentSentenceStart = globalIndex
            sentenceBreakPending = false
          }

          const span = document.createElement('span')
          span.className = 'ir-unit'
          span.textContent = tok.text
          span.dataset.irUnitIndex = String(globalIndex)
          span.dataset.irSentenceIndex = String(sentenceIndex)
          parent.insertBefore(span, insertBefore)
          inserted.push(span)

          units.push({ globalIndex, element: span, text: tok.text, sentenceIndex })
          globalIndex++
          continue
        }

        const plain = document.createTextNode(tok.text)
        parent.insertBefore(plain, insertBefore)
        inserted.push(plain)

        if (tok.kind === 'punct' && isSentenceBoundaryText(tok.text)) scheduleSentenceBreak()
      }

      parent.removeChild(textNode)
      wrapRecords.push({ parent, inserted, originalText: raw })
    }
  }

  closeSentenceIfNeeded(globalIndex)

  const cleanup = () => {
    // Remove classes.
    for (const u of units) {
      u.element.classList.remove('ir-word-active', 'ir-sentence-active')
      u.element.removeAttribute('data-ir-unit-index')
      u.element.removeAttribute('data-ir-sentence-index')
    }

    // Restore original Text nodes.
    for (const rec of wrapRecords) {
      if (rec.inserted.length === 0) continue
      const anchor = rec.inserted[0]
      if (!anchor.parentNode) continue
      const restored = document.createTextNode(rec.originalText)
      rec.parent.insertBefore(restored, anchor)
      for (const n of rec.inserted) {
        try {
          rec.parent.removeChild(n)
        } catch {
          // ignore
        }
      }
    }
  }

  return { highlightWord, highlightSentence, units, sentenceRanges, cleanup }
}
