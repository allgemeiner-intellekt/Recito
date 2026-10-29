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
    if (!this.destroyed && this.highlighter instanceof WereadHighlighter) {
      this.highlighter.highlightProgress(chunk, currentTime, duration);
    }
  }

  highlightWord(chunk: TextChunk, word: string, wordIndex: number): void {
    if (this.destroyed) return;
    const start = findWordPosition(chunk.text, word, wordIndex);
    if (start < 0) return;
    // WeRead's unspaced Chinese uses audio progress for character highlighting.
    if (!(this.highlighter instanceof WereadHighlighter && /\p{Script=Han}/u.test(chunk.text))) {
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
