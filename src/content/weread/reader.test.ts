// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installWereadCapture } from './capture';
import { extractWeread } from './reader';
import { assembleChapter } from './model';
import { WereadHighlighter } from './highlighter';
import { initAutoScroll, destroyAutoScroll } from '../highlighting/auto-scroll';

let dispose: () => void;
const originalRangeRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
const rangeRect = vi.fn(function(this: Range) {
  const parent = this.startContainer.parentElement!;
  const x = Number(parent.dataset.x ?? 0) + this.startOffset * 21;
  const y = Number(parent.dataset.y ?? 0);
  return { left: x, top: y, width: 21, height: 30, bottom: y + 30, right: x + 21 } as DOMRect;
});

beforeEach(() => {
  document.body.innerHTML = `<div id="preRenderContainer"><style>ignored</style><div class="chapterTitle">标题</div><p data-y="0">前文</p><p data-y="60">后段</p></div>
    <div class="readerChapterContent"><div class="chapterTitle">本章</div><div class="renderTargetContainer"><div class="wr_canvasContainer"><canvas></canvas></div></div></div>`;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function(this: Element) {
    const live = this.classList.contains('renderTargetContainer');
    return { left: live ? 10 : 0, top: live ? 100 : 0, width: Number((this as HTMLElement).dataset.width ?? 798), height: 90 } as DOMRect;
  });
  rangeRect.mockClear();
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: rangeRect });
  dispose = installWereadCapture();
});

afterEach(() => {
  dispose();
  vi.restoreAllMocks();
  if (originalRangeRect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', originalRangeRect);
  else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  destroyAutoScroll();
});

function capture() { document.querySelector('#preRenderContainer')!.getBoundingClientRect(); }

describe('WeRead prototype', () => {
  it('retains the entire chapter before its temporary DOM is removed, including the virtualized tail', async () => {
    capture();
    document.querySelector('#preRenderContainer')!.remove();
    const chapter = await extractWeread();
    expect(chapter.text.replace(/\s/g, '')).toBe('前文后段');
    expect(chapter.runs[0]).toMatchObject({ text: '前', x: 0, y: 0, width: 21, height: 30 });
    expect(chapter.runs[2]).toMatchObject({ text: '后', x: 0, y: 60 });
    expect(rangeRect).toHaveBeenCalledTimes(4);
  });

  it('captures once per layout, passes unrelated measurements through, and recaptures changed text', async () => {
    capture(); capture();
    document.querySelector('.chapterTitle')!.getBoundingClientRect();
    expect(rangeRect).toHaveBeenCalledTimes(4);
    document.querySelector('#preRenderContainer p')!.textContent = '新文';
    capture();
    expect(rangeRect).toHaveBeenCalledTimes(8);
    expect((await extractWeread()).text.replace(/\s/g, '')).toBe('新文后段');
  });

  it('captures the desktop container which has a class but no ID', async () => {
    const temporary = document.querySelector('#preRenderContainer')!;
    temporary.removeAttribute('id');
    temporary.className = 'preRenderContainer';
    temporary.getBoundingClientRect();
    expect((await extractWeread()).text.replace(/\s/g, '')).toBe('前文后段');
  });

  it('fails explicitly when capture did not run or the chapter width changed', async () => {
    await expect(extractWeread()).rejects.toThrow('完整排版');
    capture();
    (document.querySelector('.renderTargetContainer') as HTMLElement).dataset.width = '600';
    await expect(extractWeread()).rejects.toThrow('宽度已变化');
  });

  it('preserves surrogate pairs and the UTF-16 offsets used by playback', async () => {
    document.querySelector('#preRenderContainer p')!.textContent = '前😀文';
    capture();
    const chapter = await extractWeread();
    expect(chapter.runs[1]).toMatchObject({ text: '😀', startOffset: 1, endOffset: 3 });
    for (const run of chapter.runs) expect(chapter.text.slice(run.startOffset, run.endOffset)).toBe(run.text);
  });

  it('sorts mixed language by geometry and preserves sentence offsets', () => {
    const run = (text: string, x: number, baseline: number) => ({ text, x, y: baseline - 10, baseline, width: 20, height: 20 });
    const chapter = assembleChapter([run('。', 20, 40), run('好', 0, 40), run('world', 80, 0), run('Hello', 0, 0)]);
    expect(chapter.text).toBe('Hello world好。');
    for (const item of chapter.runs) expect(chapter.text.slice(item.startOffset, item.endOffset)).toBe(item.text);
  });

  it('paints the active sentence/character, scrolls once per line, and releases the observer', async () => {
    capture();
    const chapter = await extractWeread();
    initAutoScroll();
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const invalidated = vi.fn();
    const manager = new WereadHighlighter(chapter, { wordEnabled: true, sentenceEnabled: true, autoScroll: true,
      wordColor: 'rgba(255,255,0,.3)', sentenceColor: 'rgba(255,255,0,.1)' }, invalidated);
    manager.highlightSentence(0, 2); manager.highlightSentence(0, 2);
    expect(document.querySelector('.recito-weread-highlights')!.querySelectorAll('div').length).toBe(3);
    expect(scroll).toHaveBeenCalledTimes(1);
    manager.highlightProgress({ index: 0, text: '前文', startOffset: 0, endOffset: 2, wordCount: 1 }, .75, 1);
    expect(document.querySelector<HTMLElement>('.recito-weread-highlights > div:last-child > div')!.style.left).toBe('21px');
    expect(scroll).toHaveBeenCalledTimes(1);
    manager.destroy();
    document.querySelector('canvas')!.setAttribute('width', '800');
    await Promise.resolve();
    expect(invalidated).not.toHaveBeenCalled();
    expect(document.querySelector('.recito-weread-highlights')).toBeNull();
  });
});
