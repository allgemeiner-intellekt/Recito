import type { ResolvedHighlightSettings, TextChunk } from '@shared/types';
import { splitSentences } from '../extraction/sentence-splitter';
import type { WereadChapter } from '../weread/reader';
import { WereadHighlighter } from '../weread/highlighter';
import { WereadScrubber } from '../weread/scrubber';
import { HighlightManager } from './highlight-manager';
import { initAutoScroll, destroyAutoScroll } from './auto-scroll';
import { initTextScrubber, destroyTextScrubber } from './text-scrubber';

interface PlaybackAnnotationCallbacks {
  isActive: () => boolean;
  onSeek: (chunkIndex: number) => void;
  onInvalidated: () => void;
}

/** Own the highlights, scrolling and seek gestures for one extracted source. */
export class PlaybackAnnotations {
  private highlighter: HighlightManager | WereadHighlighter;
  private scrubber: WereadScrubber | null = null;
  private destroyed = false;

  constructor(source: Element | WereadChapter, chunks: TextChunk[], settings: ResolvedHighlightSettings,
    callbacks: PlaybackAnnotationCallbacks) {
    if (source instanceof Element) {
      this.highlighter = new HighlightManager(settings);
      this.highlighter.init(source);
      initTextScrubber(this.highlighter, chunks, callbacks.onSeek);
    } else {
      this.highlighter = new WereadHighlighter(source, settings, () => {
        this.destroy();
        callbacks.onInvalidated();
      });
      this.scrubber = new WereadScrubber(source, chunks, callbacks.isActive, callbacks.onSeek);
    }
    if (settings.autoScroll) initAutoScroll();
  }

  getFullText(): string { return this.highlighter.getFullText(); }

  highlightProgress(chunk: TextChunk, currentTime: number, duration: number): void {
    // Unspaced Chinese is one whitespace-delimited "word". Estimate a
    // character from the audio position for both DOM and WeRead rendering.
    if (this.destroyed || !/\p{Script=Han}/u.test(chunk.text)
      || !Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) return;
    let offset = Math.min(chunk.text.length - 1,
      Math.floor(Math.max(0, currentTime / duration) * chunk.text.length));
    // DOM offsets use UTF-16; keep supplementary characters intact.
    if (offset > 0 && /[\uDC00-\uDFFF]/.test(chunk.text[offset])) offset--;
    const length = (chunk.text.codePointAt(offset) ?? 0) > 0xffff ? 2 : 1;
    this.highlighter.highlightSentence(chunk.startOffset, chunk.endOffset);
    this.highlighter.highlightWord(chunk.startOffset + offset, chunk.startOffset + offset + length);
  }

  highlightWord(chunk: TextChunk, word: string, wordIndex: number): void {
    if (this.destroyed) return;
    const start = findWordPosition(chunk.text, word, wordIndex);
    if (start < 0) return;
    // Do not replace the estimated Chinese character with a whole timed span.
    if (!/\p{Script=Han}/u.test(chunk.text)) {
      this.highlighter.highlightWord(chunk.startOffset + start, chunk.startOffset + start + word.length);
    }
    const sentence = splitSentences(chunk.text).find(item => start >= item.startOffset && start < item.endOffset);
    this.highlighter.highlightSentence(chunk.startOffset + (sentence?.startOffset ?? 0),
      chunk.startOffset + (sentence?.endOffset ?? chunk.text.length));
  }

  clearAll(): void { this.highlighter.clearAll(); }

  updateColors(settings: ResolvedHighlightSettings): void { this.highlighter.updateColors(settings); }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.scrubber?.destroy();
    destroyTextScrubber();
    destroyAutoScroll();
    this.highlighter.destroy();
  }
}

function findWordPosition(text: string, word: string, wordIndex: number): number {
  const words = /\S+/g;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = words.exec(text)) !== null) {
    if (index === wordIndex) return match.index;
    index++;
  }
  return text.indexOf(word);
}
