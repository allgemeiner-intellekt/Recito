// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { MarkerOverlay } from './marker-overlay';

let overlay: MarkerOverlay | undefined;
afterEach(() => {
  overlay?.destroy();
  vi.restoreAllMocks();
  delete (Range.prototype as Partial<Range>).getClientRects;
});

/** Lay out each character as a 10×20 box, wrapping every `perLine` characters. */
function fakeLayout(perLine: number) {
  document.elementFromPoint = () => document.querySelector('p');
  Range.prototype.getClientRects = function (this: Range) {
    const rects = [];
    for (let i = this.startOffset; i < this.endOffset; i++) {
      const x = (i % perLine) * 10;
      const y = Math.floor(i / perLine) * 20;
      rects.push({ left: x, right: x + 10, top: y, bottom: y + 20, width: 10, height: 20 });
    }
    return rects as unknown as DOMRectList;
  };
}

function range(start: number, end: number): Range {
  const r = document.createRange();
  const text = document.querySelector('p')!.firstChild!;
  r.setStart(text, start);
  r.setEnd(text, end);
  return r;
}

function shadow() {
  return document.querySelector('recito-highlights')!.shadowRoot!;
}

it('glides between words on a line and jumps to a new line', () => {
  document.body.innerHTML = '<p>one two three four</p>';
  fakeLayout(10);
  overlay = new MarkerOverlay(false);
  const word = shadow().querySelector<HTMLElement>('.word')!;
  const glides: boolean[] = [];
  const observer = vi.spyOn(word.classList, 'add');

  for (const [start, end] of [
    [0, 3],
    [4, 7],
    [8, 13],
    [14, 18],
  ]) {
    observer.mockClear();
    overlay.setWord(range(start, end));
    glides.push(!observer.mock.calls.some(([name]) => name === 'snap'));
  }

  // First placement and the wrap onto line two snap; same-line moves glide.
  expect(glides).toEqual([false, true, true, false]);
  expect(word.style.transform).toBe('translate(37px, 19px)');
  expect(word.style.width).toBe('46px');
  expect(word.style.opacity).toBe('1');
  overlay.setWord(null);
  expect(word.style.opacity).toBe('0');
});

it('draws one rounded band per line of the sentence', () => {
  document.body.innerHTML = '<p>one two three four</p>';
  fakeLayout(10);
  overlay = new MarkerOverlay(false);
  overlay.setSentence([range(0, 18)]);
  expect(shadow().querySelectorAll('.sentence')).toHaveLength(2);
  overlay.setSentence([]);
  expect(shadow().querySelectorAll('.sentence')).toHaveLength(0);
});

it('hides shapes whose text is covered by other page content', () => {
  document.body.innerHTML = '<p>one two</p><header>sticky</header>';
  fakeLayout(10);
  document.elementFromPoint = () => document.querySelector('header');
  overlay = new MarkerOverlay(false);
  overlay.setWord(range(0, 3));
  expect(shadow().querySelector<HTMLElement>('.word')!.style.opacity).toBe('0');
});
