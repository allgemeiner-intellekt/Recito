import type { TextMapResult, TextNodeEntry, ResolvedHighlightSettings } from '@shared/types';
import { buildTextNodeMap } from '../extraction/dom-mapper';
import { createRangeFromOffsets } from './utils';
import { injectHighlightStyles, updateHighlightStyles, removeHighlightStyles } from './styles';
import { scrollToHighlight } from './auto-scroll';

/**
 * Manages word and sentence highlighting on the page.
 *
 * Prefers the CSS Custom Highlight API (CSS.highlights) when available,
 * falling back to wrapping text in <mark> elements.
 */
export class HighlightManager {
  private lastRange: Range | null = null;
  private textMap: TextMapResult | null = null;
  private styleEl: HTMLStyleElement | null = null;
  private wordHighlight: Highlight | null = null;
  private sentenceHighlight: Highlight | null = null;
  private scrubHoverHighlight: Highlight | null = null;
  private settings: ResolvedHighlightSettings;
  private useNativeHighlight: boolean;
  private markElements: HTMLElement[] = [];

  constructor(settings: ResolvedHighlightSettings) {
    this.settings = settings;
    this.useNativeHighlight = typeof CSS !== 'undefined' && 'highlights' in CSS;
  }

  /**
   * Use (or build) the text-node map for the source element and inject styles.
   * Pass the map the chunk offsets were computed against so both agree.
   */
  init(sourceElement: Element, textMap?: TextMapResult): void {
    this.textMap = textMap ?? buildTextNodeMap(sourceElement);
    this.styleEl = injectHighlightStyles(this.settings);

    if (this.useNativeHighlight) {
      this.wordHighlight = new Highlight();
      this.wordHighlight.priority = 2;
      this.sentenceHighlight = new Highlight();
      this.sentenceHighlight.priority = 0;
      this.scrubHoverHighlight = new Highlight();
      this.scrubHoverHighlight.priority = 1;
      CSS.highlights.set('ir-word', this.wordHighlight);
      CSS.highlights.set('ir-sentence', this.sentenceHighlight);
      CSS.highlights.set('ir-scrub-hover', this.scrubHoverHighlight);
    }
  }

  /**
   * Highlight a single word by character offsets.
   */
  highlightWord(charStart: number, charEnd: number): void {
    if (!this.textMap) return;
    if (!this.settings.wordEnabled) {
      const range = createRangeFromOffsets(this.textMap.entries, charStart, charEnd);
      if (range && this.settings.autoScroll) scrollToHighlight(range);
      return;
    }

    this.clearWordHighlight();

    const range = createRangeFromOffsets(this.textMap.entries, charStart, charEnd);
    if (!range) return;

    if (this.useNativeHighlight && this.wordHighlight) {
      this.wordHighlight.add(range);
    } else {
      this.applyMarkFallback(range, 'ir-word-mark');
    }

    if (this.settings.autoScroll) {
      scrollToHighlight(range);
    }
  }

  /**
   * Highlight a sentence by character offsets.
   */
  highlightSentence(charStart: number, charEnd: number): void {
    this.highlightSentenceSpans([[charStart, charEnd]]);
  }

  /** Highlight a sentence made of several DOM spans (it skips unspoken content). */
  highlightSentenceSpans(spans: [number, number][]): void {
    if (!this.textMap || !this.settings.sentenceEnabled) return;

    this.clearSentenceHighlight();

    const ranges = this.rangesFor(spans);
    if (ranges.length === 0) return;

    this.lastRange = ranges[0];
    for (const range of ranges) {
      if (this.useNativeHighlight && this.sentenceHighlight) {
        this.sentenceHighlight.add(range);
      } else {
        this.applyMarkFallback(range, 'ir-sentence-mark');
      }
    }
  }

  private rangesFor(spans: [number, number][]): Range[] {
    if (!this.textMap) return [];
    const ranges: Range[] = [];
    for (const [start, end] of spans) {
      const range = createRangeFromOffsets(this.textMap.entries, start, end);
      if (range) ranges.push(range);
    }
    return ranges;
  }

  clearWordHighlight(): void {
    if (this.useNativeHighlight && this.wordHighlight) {
      this.wordHighlight.clear();
    } else {
      this.removeMarksByClass('ir-word-mark');
    }
  }

  clearSentenceHighlight(): void {
    if (this.useNativeHighlight && this.sentenceHighlight) {
      this.sentenceHighlight.clear();
    } else {
      this.removeMarksByClass('ir-sentence-mark');
    }
  }

  /**
   * Highlight a sentence/chunk for the scrub hover effect.
   */
  highlightScrubHover(spans: [number, number][]): void {
    if (!this.textMap) return;

    this.clearScrubHover();

    for (const range of this.rangesFor(spans)) {
      if (this.useNativeHighlight && this.scrubHoverHighlight) {
        this.scrubHoverHighlight.add(range);
      } else {
        this.applyMarkFallback(range, 'ir-scrub-hover-mark');
      }
    }
  }

  clearScrubHover(): void {
    if (this.useNativeHighlight && this.scrubHoverHighlight) {
      this.scrubHoverHighlight.clear();
    } else {
      this.removeMarksByClass('ir-scrub-hover-mark');
    }
  }

  /**
   * Return the text node entries for external offset mapping.
   */
  getEntries(): TextNodeEntry[] {
    return this.textMap?.entries ?? [];
  }

  /**
   * Return the concatenated plain text from the DOM text node map.
   */
  getFullText(): string {
    if (!this.textMap) return '';
    return this.textMap.text;
  }

  isReadingVisible(): boolean {
    const rect = this.lastRange?.getBoundingClientRect();
    return !rect || (rect.top >= 0 && rect.bottom <= window.innerHeight);
  }

  returnToReading(): void {
    const range = this.lastRange;
    if (!range) return;
    const rect = range.getBoundingClientRect();
    for (
      let parent = range.startContainer.parentElement;
      parent && parent !== document.body;
      parent = parent.parentElement
    ) {
      if (
        parent.scrollHeight > parent.clientHeight &&
        /auto|scroll/.test(getComputedStyle(parent).overflowY)
      ) {
        const box = parent.getBoundingClientRect();
        parent.scrollBy({
          top: rect.top + rect.height / 2 - box.top - parent.clientHeight / 2,
          behavior: 'auto',
        });
        return;
      }
    }
    window.scrollBy({ top: rect.top + rect.height / 2 - window.innerHeight / 2, behavior: 'auto' });
  }

  clearAll(): void {
    this.clearWordHighlight();
    this.clearSentenceHighlight();
    this.clearScrubHover();
  }

  updateColors(settings: ResolvedHighlightSettings): void {
    this.clearAll();
    this.settings = settings;
    if (this.styleEl) {
      updateHighlightStyles(this.styleEl, settings);
    }
  }

  destroy(): void {
    this.clearAll();

    if (this.useNativeHighlight) {
      CSS.highlights.delete('ir-word');
      CSS.highlights.delete('ir-sentence');
      CSS.highlights.delete('ir-scrub-hover');
    }

    this.wordHighlight = null;
    this.sentenceHighlight = null;
    this.scrubHoverHighlight = null;
    this.textMap = null;

    if (this.styleEl) {
      removeHighlightStyles(this.styleEl);
      this.styleEl = null;
    }
  }

  // --- Fallback: wrap range content in <mark> elements ---

  private applyMarkFallback(range: Range, className: string): void {
    // Use surroundContents for simple same-node ranges,
    // otherwise use extractContents/insertNode approach.
    try {
      if (range.startContainer === range.endContainer) {
        const mark = document.createElement('mark');
        mark.className = className;
        range.surroundContents(mark);
        this.markElements.push(mark);
      } else {
        // For cross-node ranges, highlight each text node individually
        this.highlightRangeNodes(range, className);
      }
    } catch {
      // surroundContents can throw if the range partially selects a non-text node
      this.highlightRangeNodes(range, className);
    }
  }

  private highlightRangeNodes(range: Range, className: string): void {
    if (!this.textMap) return;

    // Collect text nodes within the range
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);

    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      if (range.intersectsNode(node)) {
        textNodes.push(node);
      }
    }

    for (const textNode of textNodes) {
      const nodeRange = document.createRange();

      if (textNode === range.startContainer) {
        nodeRange.setStart(textNode, range.startOffset);
      } else {
        nodeRange.setStart(textNode, 0);
      }

      if (textNode === range.endContainer) {
        nodeRange.setEnd(textNode, range.endOffset);
      } else {
        nodeRange.setEnd(textNode, textNode.length);
      }

      if (nodeRange.toString().length === 0) continue;

      const mark = document.createElement('mark');
      mark.className = className;
      try {
        nodeRange.surroundContents(mark);
        this.markElements.push(mark);
      } catch {
        // Skip nodes that can't be wrapped
      }
    }
  }

  private removeMarksByClass(className: string): void {
    const toRemove: HTMLElement[] = [];
    this.markElements = this.markElements.filter((mark) => {
      if (mark.classList.contains(className)) {
        toRemove.push(mark);
        return false;
      }
      return true;
    });

    for (const mark of toRemove) {
      const parent = mark.parentNode;
      if (!parent) continue;
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
      parent.normalize(); // merge adjacent text nodes
    }
  }
}
