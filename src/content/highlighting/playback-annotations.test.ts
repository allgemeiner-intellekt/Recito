// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResolvedHighlightSettings } from '@shared/types';
import { chunkText } from '@shared/chunker';
import { assembleChapter } from '../weread/model';
import { PlaybackAnnotations } from './playback-annotations';

const settings: ResolvedHighlightSettings = { wordEnabled: true, sentenceEnabled: true, autoScroll: false,
  wordColor: 'yellow', sentenceColor: 'orange' };
let annotations: PlaybackAnnotations | undefined;

afterEach(() => {
  annotations?.destroy();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('playback annotations', () => {
  function initArticle(html: string, options = settings) {
    vi.stubGlobal('CSS', { highlights: new Map() });
    vi.stubGlobal('Highlight', class extends Set<Range> { priority = 0; });
    document.body.innerHTML = `<article>${html}</article>`;
    const source = document.querySelector('article')!;
    const chunks = chunkText(source.textContent!);
    annotations = new PlaybackAnnotations(source, chunks, options, {
      isActive: () => true, onSeek: vi.fn(), onInvalidated: vi.fn(),
    });
    return chunks;
  }

  function highlighted(name = 'ir-word') {
    return [...CSS.highlights.get(name)!].map(range => range.toString());
  }

  it('advances Chinese characters across inline elements without word timing overriding them', () => {
    const chunks = initArticle('前文。今天<strong>天气</strong>很好。');
    const chunk = chunks[1];
    annotations!.highlightWord(chunk, chunk.text, 0);
    expect(highlighted()).toEqual([]);
    const actual: string[] = [];
    for (const time of [0, 0.2, 0.4, 0.5, 0.7, 0.8, 1]) {
      annotations!.highlightProgress(chunk, time, 1);
      annotations!.highlightWord(chunk, chunk.text, 0);
      actual.push(highlighted()[0]);
      expect(highlighted('ir-sentence')).toEqual([chunk.text]);
    }
    expect(actual).toEqual(['今', '天', '天', '气', '很', '好', '。']);
  });

  it('uses the supplied audio position after backward seeks and chunk changes', () => {
    const chunks = initArticle('前文。今天<strong>天气</strong>很好。');
    annotations!.highlightProgress(chunks[1], 0.8, 1);
    expect(highlighted()).toEqual(['好']);
    annotations!.clearAll();
    expect(highlighted()).toEqual([]);
    annotations!.highlightProgress(chunks[0], 0, 1);
    expect(highlighted()).toEqual(['前']);
    annotations!.highlightProgress(chunks[1], 0.2, 1);
    expect(highlighted()).toEqual(['天']);
    annotations!.destroy();
    annotations!.highlightProgress(chunks[1], 0.8, 1);
    expect(CSS.highlights.size).toBe(0);
  });

  it('does not split supplementary characters or run outside the chunk', () => {
    const [chunk] = initArticle('今天<strong>𠮷</strong>很好。');
    annotations!.highlightProgress(chunk, 0.5, 1);
    expect(highlighted()).toEqual(['𠮷']);
    annotations!.highlightProgress(chunk, -1, 1);
    expect(highlighted()).toEqual(['今']);
    annotations!.highlightProgress(chunk, 2, 1);
    expect(highlighted()).toEqual(['。']);
  });

  it('ignores unavailable audio timing and preserves English word highlighting', () => {
    const chunks = initArticle('今天很好。Hello world.');
    for (const [time, duration] of [[0, 0], [0, -1], [NaN, 1], [1, Infinity]]) {
      annotations!.highlightProgress(chunks[0], time, duration);
      expect(highlighted()).toEqual([]);
    }
    annotations!.highlightWord(chunks[1], 'world.', 1);
    annotations!.highlightProgress(chunks[1], 0, 1);
    expect(highlighted()).toEqual(['world.']);
  });

  it('keeps sentence highlighting when word highlighting is disabled', () => {
    const [chunk] = initArticle('今天天气很好。', { ...settings, wordEnabled: false });
    annotations!.highlightProgress(chunk, 0.5, 1);
    expect(highlighted()).toEqual([]);
    expect(highlighted('ir-sentence')).toEqual([chunk.text]);
  });

  it('maps word timing to DOM ranges and releases highlights on stop', () => {
    vi.stubGlobal('CSS', { highlights: new Map() });
    vi.stubGlobal('Highlight', class extends Set<Range> { priority = 0; });
    document.body.innerHTML = '<p>Hello again. Hello world.</p>';
    const source = document.querySelector('p')!;
    const chunks = chunkText(source.textContent!);
    annotations = new PlaybackAnnotations(source, chunks, settings, {
      isActive: () => true, onSeek: vi.fn(), onInvalidated: vi.fn(),
    });
    expect(annotations.getFullText()).toBe(source.textContent);
    annotations.highlightWord(chunks[1], 'Hello', 0);
    expect([...CSS.highlights.get('ir-word')!].map(range => range.toString())).toEqual(['Hello']);
    expect([...CSS.highlights.get('ir-sentence')!].map(range => range.toString())).toEqual(['Hello world.']);
    annotations.clearAll();
    expect(CSS.highlights.get('ir-word')!.size).toBe(0);
    annotations.destroy();
    expect(CSS.highlights.size).toBe(0);
    expect(document.querySelector('#ir-highlight-styles')).toBeNull();
  });

  it('cleans up WeRead highlights and a pending seek immediately when the reader disappears', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<main class="readerChapterContent"><div class="renderTargetContainer"><div class="wr_canvasContainer"><canvas></canvas></div></div></main>';
    const root = document.querySelector<HTMLElement>('.renderTargetContainer')!;
    root.getBoundingClientRect = () => new DOMRect(0, 0, 798, 100);
    const layout = assembleChapter([...'前文。'].map((text, index) => ({ text, x: index * 21, y: 0, width: 21, height: 30, baseline: 15 })));
    const chunks = chunkText(layout.text);
    const onSeek = vi.fn();
    const onInvalidated = vi.fn();
    annotations = new PlaybackAnnotations({ ...layout, root, title: '本章' }, chunks, settings, {
      isActive: () => true, onSeek, onInvalidated,
    });
    annotations.highlightProgress(chunks[0], 0.5, 1);
    expect(document.querySelector<HTMLElement>('.recito-weread-word > div')!.style.left).toBe('21px');
    // Whitespace-based Chinese word timing must not replace the estimated character.
    annotations.highlightWord(chunks[0], chunks[0].text, 0);
    expect(document.querySelector<HTMLElement>('.recito-weread-word > div')!.style.width).toBe('21px');
    for (const type of ['pointerdown', 'pointerup', 'click']) {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, detail: 1, clientX: 5, clientY: 15 });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      root.querySelector('canvas')!.dispatchEvent(event);
    }
    expect(vi.getTimerCount()).toBe(1);
    root.parentElement!.remove();
    await Promise.resolve();
    expect(onInvalidated).toHaveBeenCalledOnce();
    expect(root.querySelector('.recito-weread-highlights')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    vi.runAllTimers();
    expect(onSeek).not.toHaveBeenCalled();
  });
});
