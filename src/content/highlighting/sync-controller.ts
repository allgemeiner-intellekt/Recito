import type { HighlighterHandle, SentenceRange } from './highlighter'
import type { ChunkMetaLite } from '../state/player-store'
import type { ScrollManager } from './scroll-manager'

export interface SyncUpdate {
  chunkIndex: number
  chunkTime: number
  chunkDuration: number
  chunkMeta: ChunkMetaLite
}

export interface SyncController {
  update: (u: SyncUpdate) => void
  destroy: () => void
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function findSentenceRange(ranges: SentenceRange[], sentenceIndex: number): SentenceRange | null {
  return ranges.find((r) => r.sentenceIndex === sentenceIndex) ?? null
}

export function createSyncController(highlighter: HighlighterHandle, scrollManager: ScrollManager): SyncController {
  let lastUnitIndex = -1
  let lastSentenceIndex = -1

  const update = (u: SyncUpdate) => {
    const { chunkTime, chunkDuration, chunkMeta } = u
    const ratio = chunkDuration > 0 ? chunkTime / chunkDuration : 0
    const within = clamp(Math.floor(ratio * Math.max(1, chunkMeta.unitCount)), 0, Math.max(0, chunkMeta.unitCount - 1))
    const unitIndex = chunkMeta.startUnitIndex + within
    if (unitIndex === lastUnitIndex) return
    if (unitIndex < 0 || unitIndex >= highlighter.units.length) return

    const unit = highlighter.units[unitIndex]
    if (!unit) return

    // Word highlight: flip only prev+current.
    if (highlighter.highlightWord) {
      if (lastUnitIndex >= 0) highlighter.units[lastUnitIndex]?.element.classList.remove('ir-word-active')
      unit.element.classList.add('ir-word-active')
    }

    // Sentence highlight: clear previous sentence range and apply current.
    const sentenceIndex = unit.sentenceIndex
    if (highlighter.highlightSentence && sentenceIndex !== lastSentenceIndex) {
      const prev = findSentenceRange(highlighter.sentenceRanges, lastSentenceIndex)
      if (prev) {
        for (let i = prev.startUnitIndex; i <= prev.endUnitIndex; i++) {
          highlighter.units[i]?.element.classList.remove('ir-sentence-active')
        }
      }

      const cur = findSentenceRange(highlighter.sentenceRanges, sentenceIndex)
      if (cur) {
        for (let i = cur.startUnitIndex; i <= cur.endUnitIndex; i++) {
          highlighter.units[i]?.element.classList.add('ir-sentence-active')
        }
      }
      lastSentenceIndex = sentenceIndex
    }

    lastUnitIndex = unitIndex
    scrollManager.maybeScroll(unit.element)
  }

  const destroy = () => {
    if (highlighter.highlightWord && lastUnitIndex >= 0) highlighter.units[lastUnitIndex]?.element.classList.remove('ir-word-active')
    if (highlighter.highlightSentence) {
      const prev = findSentenceRange(highlighter.sentenceRanges, lastSentenceIndex)
      if (prev) {
        for (let i = prev.startUnitIndex; i <= prev.endUnitIndex; i++) {
          highlighter.units[i]?.element.classList.remove('ir-sentence-active')
        }
      }
    }
    lastUnitIndex = -1
    lastSentenceIndex = -1
  }

  return { update, destroy }
}
