/**
 * Paints the word marker and sentence band as rounded shapes in a fixed layer
 * above the page. The CSS Custom Highlight API can't round, pad or animate, so
 * the marker glides between words here instead.
 *
 * The layer blends with the page (multiply on light pages, screen on dark ones)
 * so text under it stays readable. Shapes are re-measured from their live
 * Ranges on every update and on scroll/resize.
 */

const PAD_X = 3;
const PAD_Y = 1;
const GLIDE = '160ms cubic-bezier(.25,.8,.3,1)';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class MarkerOverlay {
  private host = document.createElement('recito-highlights');
  private root: ShadowRoot;
  private sentenceLayer = document.createElement('div');
  private word = document.createElement('div');
  private wordRange: Range | null = null;
  private sentenceRanges: Range[] = [];
  private wordLineY: number | null = null;
  private frame = 0;
  private onViewportChange = () => {
    if (!this.frame) this.frame = requestAnimationFrame(() => this.reposition());
  };

  constructor(darkPage: boolean) {
    this.host.setAttribute('aria-hidden', 'true');
    Object.assign(this.host.style, {
      all: 'initial',
      position: 'fixed',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '2147483646',
      mixBlendMode: darkPage ? 'screen' : 'multiply',
    });
    this.root = this.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `
      .sentence, .word { position: absolute; left: 0; top: 0; }
      .sentence { border-radius: 5px; background: var(--sentence); }
      .word {
        border-radius: 6px; background: var(--word); opacity: 0;
        transition: transform ${GLIDE}, width ${GLIDE}, height ${GLIDE}, opacity 120ms ease;
      }
      .word.snap { transition: opacity 120ms ease; }
      @media (prefers-reduced-motion: reduce) { .word { transition: none; } }
    `;
    this.word.className = 'word';
    this.root.append(style, this.sentenceLayer, this.word);
    document.documentElement.appendChild(this.host);
    window.addEventListener('scroll', this.onViewportChange, { capture: true, passive: true });
    window.addEventListener('resize', this.onViewportChange, { passive: true });
  }

  setColors(word: string, sentence: string): void {
    this.host.style.setProperty('--word', word);
    this.host.style.setProperty('--sentence', sentence);
  }

  setWord(range: Range | null): void {
    this.wordRange = range;
    this.placeWord(false);
  }

  setSentence(ranges: Range[]): void {
    this.sentenceRanges = ranges;
    this.placeSentence();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    window.removeEventListener('scroll', this.onViewportChange, { capture: true });
    window.removeEventListener('resize', this.onViewportChange);
    this.host.remove();
  }

  private reposition(): void {
    this.frame = 0;
    // Follow scrolling exactly; gliding here would make the marker lag the text.
    this.placeWord(true);
    this.placeSentence();
  }

  private placeWord(snap: boolean): void {
    const box = this.wordRange && lineBoxes(this.wordRange)[0];
    if (!box || !visible(this.wordRange!, box)) {
      this.word.style.opacity = '0';
      this.wordLineY = null;
      return;
    }
    // Jump instead of gliding onto a new line, so it never cuts across text.
    const jump = snap || this.wordLineY === null || Math.abs(this.wordLineY - box.y) > box.h / 2;
    if (jump) this.word.classList.add('snap');
    place(this.word, box);
    this.word.style.opacity = '1';
    if (jump) {
      void this.word.offsetWidth;
      this.word.classList.remove('snap');
    }
    this.wordLineY = box.y;
  }

  private placeSentence(): void {
    const shapes: HTMLElement[] = [];
    for (const range of this.sentenceRanges) {
      for (const box of lineBoxes(range)) {
        if (!visible(range, box)) continue;
        const shape = document.createElement('div');
        shape.className = 'sentence';
        place(shape, box);
        shapes.push(shape);
      }
    }
    this.sentenceLayer.replaceChildren(...shapes);
  }
}

/** One padded box per visual line of the range, in viewport coordinates. */
function lineBoxes(range: Range): Box[] {
  if (typeof range.getClientRects !== 'function') return [];
  const lines: { left: number; right: number; top: number; bottom: number }[] = [];
  for (const rect of range.getClientRects()) {
    if (rect.width < 1) continue;
    // Rects of one visual line overlap vertically, even across font sizes.
    const line = lines.find(
      (l) =>
        Math.min(l.bottom, rect.bottom) - Math.max(l.top, rect.top) >
        Math.min(l.bottom - l.top, rect.height) / 2,
    );
    if (line) {
      line.left = Math.min(line.left, rect.left);
      line.right = Math.max(line.right, rect.right);
      line.top = Math.min(line.top, rect.top);
      line.bottom = Math.max(line.bottom, rect.bottom);
    } else {
      lines.push({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
    }
  }
  return lines.map((l) => ({
    x: l.left - PAD_X,
    y: l.top - PAD_Y,
    w: l.right - l.left + PAD_X * 2,
    h: l.bottom - l.top + PAD_Y * 2,
  }));
}

/** False when the text is scrolled out of its container or covered (e.g. by a sticky header). */
function visible(range: Range, box: Box): boolean {
  const x = box.x + box.w / 2;
  const y = box.y + box.h / 2;
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
  const hit = document.elementFromPoint(x, y);
  if (!hit) return false;
  const owner =
    range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
  return !!owner && (owner.contains(hit) || hit.contains(owner));
}

function place(element: HTMLElement, box: Box): void {
  element.style.transform = `translate(${box.x}px, ${box.y}px)`;
  element.style.width = `${box.w}px`;
  element.style.height = `${box.h}px`;
}
