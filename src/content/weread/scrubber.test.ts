// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WereadScrubber } from './scrubber';
import { chunkText } from '@shared/chunker';
import type { WereadChapter } from './reader';

let scrubber: WereadScrubber;
let root: HTMLElement;
let canvas: HTMLCanvasElement;
let seek: ReturnType<typeof vi.fn>;
let active: boolean;
let top: number;

function fire(type: string, x: number, y: number, target: EventTarget = canvas, detail = 1, extra: MouseEventInit = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 100 + x, clientY: top + y, button: 0, detail, ...extra });
  Object.defineProperty(event, 'pointerId', { value: 1 });
  target.dispatchEvent(event);
  return event;
}
function click(x: number, y: number, target: EventTarget = canvas, detail = 1, extra: MouseEventInit = {}) {
  fire('pointerdown', x, y, target, detail, extra);
  fire('pointerup', x, y, target, detail, extra);
  fire('click', x, y, target, detail, extra);
}

beforeEach(() => {
  vi.useFakeTimers(); active = true; top = 200; seek = vi.fn();
  document.body.innerHTML = '<div id="reader"><canvas></canvas><span id="tail">末句。</span><button>控件</button></div>';
  root = document.querySelector('#reader')!; canvas = root.querySelector('canvas')!;
  root.getBoundingClientRect = () => new DOMRect(100, top, 500, 400);
  const text = '前句。后句跨行。末句。';
  const runs = [...text].map((character, i) => ({ text: character, x: (i < 6 ? i : i - 6) * 21,
    y: i < 6 ? 0 : 40, width: 21, height: 30, baseline: i < 6 ? 15 : 55, startOffset: i, endOffset: i + 1 }));
  const chapter: WereadChapter = { text, runs, root, title: '本章' };
  scrubber = new WereadScrubber(chapter, chunkText(text), () => active, seek);
});
afterEach(() => { scrubber.destroy(); window.getSelection()?.removeAllRanges(); vi.useRealTimers(); });

describe('WeRead click-to-seek', () => {
  it('seeks from Canvas coordinates to the clicked sentence, including a sentence wrapped across lines', () => {
    click(88, 12); vi.runAllTimers(); expect(seek).toHaveBeenLastCalledWith(1);
    click(5, 52); vi.runAllTimers(); expect(seek).toHaveBeenLastCalledWith(1);
    expect(seek).toHaveBeenCalledTimes(2);
  });
  it('works after scrolling and on the virtualized DOM tail', () => {
    top = -400;
    click(47, 52, document.querySelector('#tail')!); vi.runAllTimers();
    expect(seek).toHaveBeenCalledWith(2);
  });
  it('ignores paragraph gaps, line-end whitespace, controls, and modified clicks', () => {
    click(5, 35); click(300, 12); click(5, 12, root.querySelector('button')!);
    click(5, 12, canvas, 1, { shiftKey: true }); vi.runAllTimers(); expect(seek).not.toHaveBeenCalled();
  });
  it('ignores drags even when the pointer returns to its starting point', () => {
    fire('pointerdown', 5, 12); fire('pointermove', 50, 12); fire('pointerup', 5, 12); fire('click', 5, 12);
    vi.runAllTimers(); expect(seek).not.toHaveBeenCalled();
  });
  it('cancels pending single-click seeking on a double click', () => {
    click(5, 12); vi.advanceTimersByTime(100); click(5, 12, canvas, 2);
    fire('dblclick', 5, 12, canvas, 2); vi.runAllTimers(); expect(seek).not.toHaveBeenCalled();
  });
  it('does not seek while idle/loading or when the gesture selects text', () => {
    active = false; click(5, 12); vi.runAllTimers();
    active = true; click(5, 12);
    const selection = window.getSelection()!; const range = document.createRange();
    range.selectNodeContents(document.querySelector('#tail')!); selection.addRange(range);
    vi.runAllTimers(); expect(seek).not.toHaveBeenCalled();
  });
  it('cancels pending gestures and removes listeners on teardown', () => {
    click(5, 12); scrubber.destroy(); vi.runAllTimers(); click(88, 12); vi.runAllTimers();
    expect(seek).not.toHaveBeenCalled();
  });
});
