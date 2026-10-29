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
