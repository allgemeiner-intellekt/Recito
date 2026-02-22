import type { TextNodeEntry, Segment, WordTiming, SentenceBoundary } from '@shared/types';
import { estimateWordTimings, findWordAtTime } from './timing';
import { autoScrollRange } from './scroller';

const SENTENCE_HIGHLIGHT = 'ir-sentence';
const WORD_HIGHLIGHT = 'ir-active-word';

export class Highlighter {
  private entries: TextNodeEntry[];
  private segments: Segment[];
  private sentenceHighlight: Highlight;
  private wordHighlight: Highlight;
  private styleEl: HTMLStyleElement | null = null;

  private wordTimings: WordTiming[] = [];
  private sentences: SentenceBoundary[] = [];
  private activeWordIndex = -1;
  private activeSentenceIndex = -1;
  private activeSegmentIndex = -1;
  private timingsLockedToFinalDuration = false;

  constructor(entries: TextNodeEntry[], segments: Segment[]) {
    this.entries = entries;
    this.segments = segments;

    this.sentenceHighlight = new Highlight();
    this.sentenceHighlight.priority = 0;
    this.wordHighlight = new Highlight();
    this.wordHighlight.priority = 1;

    CSS.highlights.set(SENTENCE_HIGHLIGHT, this.sentenceHighlight);
    CSS.highlights.set(WORD_HIGHLIGHT, this.wordHighlight);

    this.injectStyles();
  }

  activateSegment(segmentIndex: number): void {
    const segment = this.segments[segmentIndex];
    if (!segment) return;

    // Clear previous highlights
    this.sentenceHighlight.clear();
    this.wordHighlight.clear();

    this.activeSegmentIndex = segmentIndex;
    this.timingsLockedToFinalDuration = false;

    // Parse sentences in segment text
    this.sentences = this.parseSentences(segment.text, segment.startOffset);

    // Estimate word timings (with charStart/charEnd relative to segment text)
    this.wordTimings = estimateWordTimings(segment.text);

    this.activeWordIndex = -1;
    this.activeSentenceIndex = -1;

    // Activate first sentence
    if (this.sentences.length > 0) {
      this.activeSentenceIndex = 0;
      const sentenceRange = this.createRange(
        this.sentences[0].startOffset,
        this.sentences[0].endOffset
      );
      if (sentenceRange) {
        this.sentenceHighlight.add(sentenceRange);
      }
    }

    // Activate first word
    if (this.wordTimings.length > 0) {
      this.activeWordIndex = 0;
      const wt = this.wordTimings[0];
      const wordRange = this.createRange(
        segment.startOffset + wt.charStart,
        segment.startOffset + wt.charEnd
      );
      if (wordRange) {
        this.wordHighlight.add(wordRange);
        autoScrollRange(wordRange);
      }
    }
  }

  updateProgress(currentTime: number, duration: number, durationFinal: boolean): void {
    if (this.wordTimings.length === 0) return;
    const segment = this.segments[this.activeSegmentIndex];
    if (!segment) return;

    // Recalculate timings when we get final duration (only once)
    if (durationFinal && duration > 0 && !this.timingsLockedToFinalDuration) {
      this.timingsLockedToFinalDuration = true;
      this.wordTimings = estimateWordTimings(segment.text, duration);
    }

    const wordIndex = findWordAtTime(this.wordTimings, currentTime);
    if (wordIndex === this.activeWordIndex) return;

    // Update word highlight
    this.wordHighlight.clear();
    if (wordIndex >= 0 && wordIndex < this.wordTimings.length) {
      const wt = this.wordTimings[wordIndex];
      const wordRange = this.createRange(
        segment.startOffset + wt.charStart,
        segment.startOffset + wt.charEnd
      );
      if (wordRange) {
        this.wordHighlight.add(wordRange);
        autoScrollRange(wordRange);
      }
    }
    this.activeWordIndex = wordIndex;

    // Check if we've moved to a new sentence
    if (wordIndex >= 0 && this.sentences.length > 0) {
      const globalCharPos = segment.startOffset + this.wordTimings[wordIndex].charStart;
      const newSentenceIndex = this.findSentenceIndex(globalCharPos);
      if (newSentenceIndex !== this.activeSentenceIndex && newSentenceIndex >= 0) {
        this.activeSentenceIndex = newSentenceIndex;
        this.sentenceHighlight.clear();
        const sentenceRange = this.createRange(
          this.sentences[newSentenceIndex].startOffset,
          this.sentences[newSentenceIndex].endOffset
        );
        if (sentenceRange) {
          this.sentenceHighlight.add(sentenceRange);
        }
      }
    }
  }

  deactivateSegment(): void {
    this.sentenceHighlight.clear();
    this.wordHighlight.clear();
    this.wordTimings = [];
    this.sentences = [];
    this.activeWordIndex = -1;
    this.activeSentenceIndex = -1;
  }

  deactivateAll(): void {
    this.deactivateSegment();
    CSS.highlights.delete(SENTENCE_HIGHLIGHT);
    CSS.highlights.delete(WORD_HIGHLIGHT);
    this.removeStyles();
  }

  /**
   * Create a DOM Range spanning from globalStart to globalEnd in the
   * text node map. Uses binary search + boundary snapping.
   */
  private createRange(globalStart: number, globalEnd: number): Range | null {
    const startPos = this.findDOMPosition(globalStart);
    const endPos = this.findDOMPosition(globalEnd);
    if (!startPos || !endPos) return null;

    try {
      const range = document.createRange();
      range.setStart(startPos.node, startPos.offset);
      range.setEnd(endPos.node, endPos.offset);
      return range;
    } catch {
      return null;
    }
  }

  /**
   * Binary search through entries to find the text node + local offset
   * for a given global character offset. Snaps to nearest entry boundary
   * when the offset falls in a separator gap.
   */
  private findDOMPosition(globalOffset: number): { node: Text; offset: number } | null {
    if (this.entries.length === 0) return null;

    // Binary search for the entry containing this offset
    let lo = 0;
    let hi = this.entries.length - 1;

    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const entry = this.entries[mid];
      if (globalOffset < entry.globalStart) {
        hi = mid - 1;
      } else if (globalOffset >= entry.globalEnd) {
        lo = mid + 1;
      } else {
        // Found: offset is within this entry
        return {
          node: entry.node,
          offset: globalOffset - entry.globalStart,
        };
      }
    }

    // Offset falls in a gap (separator). Snap to nearest boundary.
    if (lo < this.entries.length) {
      return { node: this.entries[lo].node, offset: 0 };
    }
    if (hi >= 0) {
      const entry = this.entries[hi];
      const nodeLen = entry.node.textContent?.length ?? 0;
      return { node: entry.node, offset: nodeLen };
    }

    return null;
  }

  private parseSentences(text: string, baseOffset: number): SentenceBoundary[] {
    const sentences: SentenceBoundary[] = [];
    const regex = /[^.!?]*[.!?]+[\s]*/g;
    let match: RegExpExecArray | null;
    let lastEnd = 0;

    while ((match = regex.exec(text)) !== null) {
      const sentenceText = match[0];
      if (sentenceText.trim().length === 0) continue;
      sentences.push({
        text: sentenceText,
        startOffset: baseOffset + match.index,
        endOffset: baseOffset + match.index + sentenceText.trimEnd().length,
      });
      lastEnd = match.index + sentenceText.length;
    }

    // Remaining text after last sentence-ending punctuation
    if (lastEnd < text.length) {
      const remaining = text.slice(lastEnd);
      if (remaining.trim().length > 0) {
        sentences.push({
          text: remaining,
          startOffset: baseOffset + lastEnd,
          endOffset: baseOffset + text.length,
        });
      }
    }

    // If no sentences were found, treat the whole text as one sentence
    if (sentences.length === 0 && text.trim().length > 0) {
      sentences.push({
        text,
        startOffset: baseOffset,
        endOffset: baseOffset + text.length,
      });
    }

    return sentences;
  }

  private findSentenceIndex(globalCharPos: number): number {
    for (let i = 0; i < this.sentences.length; i++) {
      if (globalCharPos >= this.sentences[i].startOffset && globalCharPos < this.sentences[i].endOffset) {
        return i;
      }
    }
    // If past all sentences, return last
    if (this.sentences.length > 0) {
      return this.sentences.length - 1;
    }
    return -1;
  }

  private injectStyles(): void {
    if (document.getElementById('ir-highlight-styles')) {
      this.styleEl = document.getElementById('ir-highlight-styles') as HTMLStyleElement;
      return;
    }

    const style = document.createElement('style');
    style.id = 'ir-highlight-styles';
    style.textContent = `
      ::highlight(${SENTENCE_HIGHLIGHT}) {
        background-color: #F5F5F5;
      }
      ::highlight(${WORD_HIGHLIGHT}) {
        background-color: #3A3A3A;
        color: #FFFFFF;
      }
    `;
    document.head.appendChild(style);
    this.styleEl = style;
  }

  private removeStyles(): void {
    this.styleEl?.remove();
    this.styleEl = null;
  }
}
