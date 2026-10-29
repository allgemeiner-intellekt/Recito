// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installWereadCapture } from './capture';
import { extractWeread } from './reader';
import { WereadHighlighter } from './highlighter';
import { initAutoScroll, destroyAutoScroll } from '../highlighting/auto-scroll';

let dispose: () => void;
let manager: WereadHighlighter | undefined;
const originalRangeRect = Object.getOwnPropertyDescriptor(Range.prototype, 'getBoundingClientRect');
function measureRangeRect(this: Range) {
  const parent = this.startContainer.parentElement!;
  const x = Number(parent.dataset.x ?? 0) + this.startOffset * 21;
  const y = Number(parent.dataset.y ?? 0);
  return { left: x, top: y, width: 21, height: 30, bottom: y + 30, right: x + 21 } as DOMRect;
}
const rangeRect = vi.fn(measureRangeRect);

beforeEach(() => {
  window.history.replaceState({}, '', '/web/reader/chapter-a');
  document.body.innerHTML = `<div id="preRenderContainer"><style>ignored</style><div class="chapterTitle">标题</div><p data-y="0">前文</p><p data-y="60">后段</p></div>
    <div class="readerChapterContent"><div class="chapterTitle">本章</div><div class="renderTargetContainer"><div class="wr_canvasContainer"><canvas></canvas></div></div></div>`;
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function(this: Element) {
    const live = this.classList.contains('renderTargetContainer');
    return { left: live ? 10 : 0, top: live ? 100 : 0, width: Number((this as HTMLElement).dataset.width ?? 798), height: 90 } as DOMRect;
  });
  rangeRect.mockClear();
  rangeRect.mockImplementation(measureRangeRect);
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', { configurable: true, value: rangeRect });
  dispose = installWereadCapture();
});

afterEach(() => {
  manager?.destroy();
  manager = undefined;
  dispose();
  vi.restoreAllMocks();
  if (originalRangeRect) Object.defineProperty(Range.prototype, 'getBoundingClientRect', originalRangeRect);
  else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
  destroyAutoScroll();
});

function capture() { document.querySelector('#preRenderContainer')!.getBoundingClientRect(); }

describe('WeRead chapter reading', () => {
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
    const temporary = document.querySelector('#preRenderContainer')!;
    temporary.replaceWith(temporary.cloneNode(true));
    capture();
    expect(rangeRect).toHaveBeenCalledTimes(8);
    document.querySelector('#preRenderContainer p')!.textContent = '新文';
    capture();
    expect(rangeRect).toHaveBeenCalledTimes(12);
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

  it('rejects the previous chapter after navigation until the new chapter is captured', async () => {
    capture();
    window.history.pushState({}, '', '/web/reader/chapter-b');
    await expect(extractWeread()).rejects.toThrow('章节已变化');
    capture();
    expect((await extractWeread()).text.replace(/\s/g, '')).toBe('前文后段');
    expect(rangeRect).toHaveBeenCalledTimes(8);
  });

  it.each(['empty', 'failed'])('discards the previous snapshot when the next capture is %s', async (failure) => {
    capture();
    if (failure === 'empty') document.querySelector('#preRenderContainer')!.replaceChildren();
    else {
      document.querySelector('#preRenderContainer p')!.textContent = '新文';
      rangeRect.mockImplementation(() => { throw new Error('Layout unavailable'); });
    }
    expect(capture).not.toThrow();
    await expect(extractWeread()).rejects.toThrow('完整排版');
    rangeRect.mockImplementation(measureRangeRect);
    document.querySelector('#preRenderContainer')!.textContent = '新章';
    capture();
    expect((await extractWeread()).text).toBe('新章');
  });

  it('recaptures a reused temporary element after another element supplied the latest snapshot', async () => {
    const original = document.querySelector('#preRenderContainer')!;
    capture();
    const next = original.cloneNode(true) as Element;
    original.replaceWith(next);
    next.querySelector('p')!.textContent = '新文';
    capture();
    next.replaceWith(original);
    capture();
    expect((await extractWeread()).text.replace(/\s/g, '')).toBe('前文后段');
  });

  it('preserves surrogate pairs and the UTF-16 offsets used by playback', async () => {
    document.querySelector('#preRenderContainer p')!.textContent = '前😀文';
    capture();
    const chapter = await extractWeread();
    expect(chapter.runs[1]).toMatchObject({ text: '😀', startOffset: 1, endOffset: 3 });
    for (const run of chapter.runs) expect(chapter.text.slice(run.startOffset, run.endOffset)).toBe(run.text);
  });

  it('retains collapsed inline spaces after English punctuation', async () => {
    document.querySelector('#preRenderContainer p')!.textContent = 'day, he';
    rangeRect.mockImplementation(function(this: Range) {
      const rect = measureRangeRect.call(this);
      return this.toString() === ' ' ? { ...rect, width: 0 } as DOMRect : rect;
    });
    capture();
    const chapter = await extractWeread();
    expect(chapter.text).toContain('day, he');
    expect(chapter.runs.find(run => run.text === 'h')).toMatchObject({ spaceBefore: true });
  });

  it('paints the active sentence/character, scrolls once per line, and releases the observer', async () => {
    capture();
    const chapter = await extractWeread();
    initAutoScroll();
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const invalidated = vi.fn();
    manager = new WereadHighlighter(chapter, { wordEnabled: true, sentenceEnabled: true, autoScroll: true,
      wordColor: 'rgba(255,255,0,.3)', sentenceColor: 'rgba(255,255,0,.1)' }, invalidated);
    manager.highlightSentence(0, 2); manager.highlightSentence(0, 2);
    const sentence = document.querySelector<HTMLElement>('.recito-weread-sentence > div')!;
    expect([sentence.style.left, sentence.style.top, sentence.style.width, sentence.style.height]).toEqual(['0px', '0px', '42px', '30px']);
    expect(scroll).toHaveBeenCalledTimes(1);
    manager.highlightWord(1, 2);
    const word = document.querySelector<HTMLElement>('.recito-weread-word > div')!;
    expect([word.style.left, word.style.width]).toEqual(['21px', '21px']);
    expect(scroll).toHaveBeenCalledTimes(1);
    document.body.appendChild(document.createElement('aside'));
    await Promise.resolve();
    expect(invalidated).not.toHaveBeenCalled();
    manager.destroy();
    document.querySelector('canvas')!.setAttribute('width', '800');
    await Promise.resolve();
    expect(invalidated).not.toHaveBeenCalled();
    expect(document.querySelector('.recito-weread-highlights')).toBeNull();
  });

  it.each(['reader removal', 'canvas replacement', 'canvas resize', 'title change', 'window resize'])(
    'invalidates once on %s', async (change) => {
      capture();
      const chapter = await extractWeread();
      const invalidated = vi.fn();
      manager = new WereadHighlighter(chapter, { wordEnabled: true, sentenceEnabled: true, autoScroll: false,
        wordColor: 'yellow', sentenceColor: 'orange' }, invalidated);
      if (change === 'reader removal') chapter.root.closest('.readerChapterContent')!.remove();
      else if (change === 'canvas replacement') chapter.root.querySelector('.wr_canvasContainer')!.replaceWith(document.createElement('div'));
      else if (change === 'canvas resize') chapter.root.querySelector('canvas')!.setAttribute('width', '800');
      else if (change === 'title change') document.querySelector('.readerChapterContent .chapterTitle')!.textContent = '下一章';
      else window.dispatchEvent(new Event('resize'));
      await Promise.resolve();
      expect(invalidated).toHaveBeenCalledOnce();
      window.dispatchEvent(new Event('resize'));
      expect(invalidated).toHaveBeenCalledOnce();
      manager.destroy();
    },
  );
});
