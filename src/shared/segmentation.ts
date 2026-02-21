import type { LangMode } from './types'

export type SegToken =
  | { kind: 'space'; text: string; start: number; end: number }
  | { kind: 'punct'; text: string; start: number; end: number }
  | { kind: 'unit'; text: string; start: number; end: number }

const CJK_RE = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/

export function detectLangMode(fullText: string, langHint?: string | null): LangMode {
  const hint = (langHint ?? '').toLowerCase()
  if (hint.startsWith('zh') || hint.startsWith('ja') || hint.startsWith('ko')) return 'cjk'
  if (hint.startsWith('en') || hint.startsWith('fr') || hint.startsWith('de') || hint.startsWith('es'))
    return 'space'

  const sample = fullText.slice(0, 2000)
  if (!sample) return 'space'

  let cjkCount = 0
  let nonSpaceCount = 0
  for (const ch of sample) {
    if (/\s/.test(ch)) continue
    nonSpaceCount++
    if (CJK_RE.test(ch)) cjkCount++
  }
  const ratio = nonSpaceCount === 0 ? 0 : cjkCount / nonSpaceCount
  return ratio > 0.3 ? 'cjk' : 'space'
}

function isLikelyPunct(ch: string): boolean {
  return /[.,!?;:，。！？；：、“”"‘’()[\]{}<>《》—–-]/.test(ch)
}

export function segmentText(text: string, langMode: LangMode, locale?: string): SegToken[] {
  if (!text) return []

  const tokens: SegToken[] = []

  const pushPlain = (kind: 'space' | 'punct', seg: string, start: number, end: number) => {
    if (!seg) return
    tokens.push({ kind, text: seg, start, end })
  }

  const pushUnit = (seg: string, start: number, end: number) => {
    if (!seg) return
    tokens.push({ kind: 'unit', text: seg, start, end })
  }

  const segLocale = locale || (langMode === 'cjk' ? 'zh' : 'en')
  const Seg = (globalThis as unknown as { Intl?: typeof Intl }).Intl?.Segmenter

  if (Seg) {
    const segmenter = new Seg(segLocale, { granularity: 'word' })
    const iter = segmenter.segment(text)[Symbol.iterator]()
    for (let next = iter.next(); !next.done; next = iter.next()) {
      const s = next.value
      const part = String(s.segment)
      const start = Number(s.index)
      const end = start + part.length

      if (/^\s+$/.test(part)) {
        pushPlain('space', part, start, end)
        continue
      }

      // Segmenter will return punctuation and symbols; keep them unwrapped.
      if (s.isWordLike) {
        pushUnit(part, start, end)
      } else if (langMode === 'cjk' && CJK_RE.test(part) && part.length === 1) {
        // Some browsers mark CJK chars as non-word-like. Still wrap them.
        pushUnit(part, start, end)
      } else {
        pushPlain('punct', part, start, end)
      }
    }
    return tokens
  }

  // Fallback: a simple scanner that keeps spaces + punctuation as-is.
  let i = 0
  while (i < text.length) {
    const ch = text[i]!
    if (/\s/.test(ch)) {
      let j = i + 1
      while (j < text.length && /\s/.test(text[j]!)) j++
      pushPlain('space', text.slice(i, j), i, j)
      i = j
      continue
    }

    if (isLikelyPunct(ch)) {
      pushPlain('punct', ch, i, i + 1)
      i++
      continue
    }

    if (langMode === 'cjk' && CJK_RE.test(ch)) {
      pushUnit(ch, i, i + 1)
      i++
      continue
    }

    // space languages: read consecutive non-space, non-punct as a word.
    let j = i + 1
    while (j < text.length && !/\s/.test(text[j]!) && !isLikelyPunct(text[j]!)) j++
    pushUnit(text.slice(i, j), i, j)
    i = j
  }

  return tokens
}

export function countUnits(text: string, langMode: LangMode, locale?: string): number {
  return segmentText(text, langMode, locale).filter((t) => t.kind === 'unit').length
}

