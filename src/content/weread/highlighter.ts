import type { ResolvedHighlightSettings, TextChunk } from '@shared/types';
import { scrollToHighlightRect } from '../highlighting/auto-scroll';
import type { WereadChapter } from './reader';

/** Prototype: at most the current sentence/word's rectangles, never a chapter-sized text layer. */
export class WereadHighlighter {
  private overlay = document.createElement('div');
  private word = document.createElement('div');
  private sentence = document.createElement('div');
  private observer: MutationObserver;
  private lastWord = '';
  private lastSentence = '';
  private lastScrollLine = -Infinity;
  private originalPosition: string;
  private onResize: () => void;

  constructor(private chapter: WereadChapter, private settings: ResolvedHighlightSettings, onInvalidated: () => void) {
    this.originalPosition = chapter.root.style.position;
    if (getComputedStyle(chapter.root).position === 'static') chapter.root.style.position = 'relative';
    this.overlay.className = 'recito-weread-highlights';
    this.overlay.setAttribute('aria-hidden', 'true');
    Object.assign(this.overlay.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '5' });
    this.overlay.append(this.sentence, this.word);
    chapter.root.appendChild(this.overlay);
    this.observer = new MutationObserver(() => { this.clearAll(); onInvalidated(); });
    const container = chapter.root.querySelector('.wr_canvasContainer');
    if (container) this.observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['width', 'height', 'style'] });
    const title = document.querySelector('.chapterTitle');
    if (title) this.observer.observe(title, { childList: true, characterData: true, subtree: true });
    if (chapter.root.parentElement) this.observer.observe(chapter.root.parentElement, { childList: true });
    this.onResize = () => { this.clearAll(); onInvalidated(); };
    window.addEventListener('resize', this.onResize);
  }

  getFullText(): string { return this.chapter.text; }

  highlightProgress(chunk: TextChunk, currentTime: number, duration: number): void {
    // Existing whitespace-based word timing treats an unspaced Chinese sentence
    // as one word. Use the real audio position for approximate character timing.
    if (!/\p{Script=Han}/u.test(chunk.text) || duration <= 0) return;
    let offset = Math.min(chunk.text.length - 1, Math.floor(Math.max(0, currentTime / duration) * chunk.text.length));
    if (offset > 0 && /[\uDC00-\uDFFF]/.test(chunk.text[offset])) offset--;
    const length = (chunk.text.codePointAt(offset) ?? 0) > 0xffff ? 2 : 1;
    this.highlightSentence(chunk.startOffset, chunk.endOffset);
    this.highlightWord(chunk.startOffset + offset, chunk.startOffset + offset + length);
  }

  highlightWord(start: number, end: number): void {
    this.scrollToRun(start);
    if (!this.settings.wordEnabled || this.lastWord === `${start}:${end}`) return;
    this.lastWord = `${start}:${end}`;
    this.paint(this.word, start, end, this.settings.wordColor);
  }

  highlightSentence(start: number, end: number): void {
    if (this.lastSentence === `${start}:${end}`) return;
    this.lastSentence = `${start}:${end}`;
    if (this.settings.sentenceEnabled) this.paint(this.sentence, start, end, this.settings.sentenceColor);
    this.scrollToRun(start);
  }

  clearAll(): void {
    this.word.replaceChildren();
    this.sentence.replaceChildren();
    this.lastWord = '';
    this.lastSentence = '';
    this.lastScrollLine = -Infinity;
  }

  updateColors(settings: ResolvedHighlightSettings): void {
    this.settings = settings;
    this.clearAll();
  }

  destroy(): void {
    this.observer.disconnect();
    window.removeEventListener('resize', this.onResize);
    this.overlay.remove();
    this.chapter.root.style.position = this.originalPosition;
  }

  private findStart(offset: number): number {
    const runs = this.chapter.runs;
    let low = 0;
    let high = runs.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (runs[mid].endOffset <= offset) low = mid + 1;
      else high = mid;
    }
    return low;
  }

  private scrollToRun(offset: number): void {
    if (!this.settings.autoScroll) return;
    const run = this.chapter.runs[this.findStart(offset)];
    if (!run || Math.abs(run.baseline - this.lastScrollLine) < 3) return;
    this.lastScrollLine = run.baseline;
    const rect = this.chapter.root.getBoundingClientRect();
    scrollToHighlightRect({ top: rect.top + run.y, bottom: rect.top + run.y + run.height,
      height: run.height, width: run.width });
  }

  private paint(layer: HTMLElement, start: number, end: number, color: string): void {
    const fragment = document.createDocumentFragment();
    // Merge adjacent glyphs on the same line into one rectangle.
    let box: { x: number; y: number; width: number; height: number } | undefined;
    const append = () => {
      if (!box) return;
      const element = document.createElement('div');
      Object.assign(element.style, { position: 'absolute', left: `${box.x}px`, top: `${box.y}px`,
        width: `${box.width}px`, height: `${box.height}px`, backgroundColor: color, borderRadius: '3px' });
      fragment.appendChild(element);
    };
    for (let i = this.findStart(start); i < this.chapter.runs.length; i++) {
      const run = this.chapter.runs[i];
      if (run.startOffset >= end) break;
      const x = run.x + run.width * Math.max(0, start - run.startOffset) / run.text.length;
      const right = run.x + run.width * Math.min(run.text.length, end - run.startOffset) / run.text.length;
      if (box && Math.abs(box.y - run.y) < run.height * 0.6 && x - box.x - box.width < run.height) {
        box.width = right - box.x;
        box.height = Math.max(box.height, run.y + run.height - box.y);
      } else {
        append();
        box = { x, y: run.y, width: right - x, height: run.height };
      }
    }
    append();
    layer.replaceChildren(fragment);
  }
}
