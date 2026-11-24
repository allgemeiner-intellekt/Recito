// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { chunkBlocks } from '@shared/chunker';
import type { TextChunk } from '@shared/types';
import { collectBlocks } from './blocks';
import { buildTextNodeMap } from './dom-mapper';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function read(html: string, options: Parameters<typeof collectBlocks>[1] = {}) {
  document.body.innerHTML = html;
  const map = buildTextNodeMap(document.body);
  const blocks = collectBlocks(map, options);
  return { map, blocks, chunks: chunkBlocks(blocks) };
}

/** Every word of every chunk must point at exactly that word on the page. */
function expectExactWordOffsets(chunks: TextChunk[], domText: string) {
  for (const chunk of chunks) {
    for (const m of chunk.text.matchAll(/\S+/g)) {
      const offsets = chunk.domOffsets!.slice(m.index!, m.index! + m[0].length);
      expect(offsets.map((o) => domText[o]).join('')).toBe(m[0]);
    }
  }
}

describe('collectBlocks', () => {
  // Framework-rendered pages (Gemini Notebook) have no whitespace between blocks.
  it('keeps headings apart from the paragraph that follows them', () => {
    const { chunks, map } = read(
      '<article><h1>The $1.4 Trillion Paradox</h1><h2>Introduction: The Public Trial</h2>' +
        '<p>Anthropic—the startup founded by ex-OpenAI researchers—is going public. It is big.</p></article>',
    );
    expect(chunks.map((c) => c.text)).toEqual([
      'The $1.4 Trillion Paradox',
      'Introduction: The Public Trial',
      'Anthropic—the startup founded by ex-OpenAI researchers—is going public.',
      'It is big.',
    ]);
    expectExactWordOffsets(chunks, map.text);
  });

  it('treats role="heading" blocks as headings and never splits them', () => {
    const { blocks, chunks } = read(
      '<div role="heading" aria-level="2"><span>1. The $900 Billion Compute Trap</span></div>' +
        '<div class="paragraph">Here is the secret. It matters.</div>',
    );
    expect(blocks.map((b) => b.heading)).toEqual([true, false]);
    expect(chunks.map((c) => c.text)).toEqual([
      '1. The $900 Billion Compute Trap',
      'Here is the secret.',
      'It matters.',
    ]);
  });

  it('collapses source whitespace but highlights the exact characters', () => {
    const { chunks, map } = read('<p>\n    Spread   over\n    several\tlines. <b>Bold</b> word.\n</p>');
    expect(chunks.map((c) => c.text)).toEqual(['Spread over several lines.', 'Bold word.']);
    expectExactWordOffsets(chunks, map.text);
  });

  it('skips hidden text and collapsed details, but reads open details', () => {
    const { chunks } = read(
      '<p>Visible text.<span hidden>Tracking pixel.</span></p>' +
        '<div style="display:none">Hidden menu.</div>' +
        '<details><summary>Deep dive</summary><p>Collapsed content.</p></details>' +
        '<details open><summary>Shown</summary><p>Open content.</p></details>' +
        '<script>var code = 1;</script><style>p { color: red }</style>',
    );
    expect(chunks.map((c) => c.text)).toEqual([
      'Visible text.',
      'Deep dive',
      'Shown',
      'Open content.',
    ]);
  });

  it('reads text inside display:contents wrappers, which have no box of their own', () => {
    // Chromium's checkVisibility() is false for boxless elements; mimic it.
    Object.defineProperty(Element.prototype, 'checkVisibility', {
      configurable: true,
      value(this: Element) {
        const own = getComputedStyle(this).display;
        if (own === 'contents' || own === 'none') return false;
        for (let el = this.parentElement; el; el = el.parentElement) {
          if (getComputedStyle(el).display === 'none') return false;
        }
        return true;
      },
    });
    try {
      const { chunks } = read(
        '<p><span style="display:contents">Wrapped text.</span></p>' +
          '<p><span style="display:contents;visibility:hidden">Invisible.</span></p>' +
          '<div style="display:none"><span style="display:contents">Under hidden.</span></div>' +
          '<details><summary>S</summary><span style="display:contents">Collapsed.</span></details>',
      );
      expect(chunks.map((c) => c.text)).toEqual(['Wrapped text.', 'S']);
    } finally {
      delete (Element.prototype as { checkVisibility?: unknown }).checkVisibility;
    }
  });

  it('separates words at line breaks and inline-block boundaries', () => {
    const { chunks } = read(
      '<p>First line<br>second line.</p>' +
        '<p><span style="display:inline-block">and</span><span style="display:inline-block">Kali</span> wrote it.</p>',
    );
    expect(chunks.map((c) => c.text)).toEqual(['First line second line.', 'and Kali wrote it.']);
  });

  it('keeps words joined across inline elements', () => {
    const { chunks, map } = read('<p>Un<em>believ</em>able results. <a href="#">Linked</a> text.</p>');
    expect(chunks.map((c) => c.text)).toEqual(['Unbelievable results.', 'Linked text.']);
    expectExactWordOffsets(chunks, map.text);
  });

  it('reads only included nodes, with a space where content was skipped', () => {
    const { chunks } = read('<p>Keep this<span class="ad">BUY NOW</span>and this.</p><nav>Menu</nav>', {
      include: (node) => !node.parentElement?.matches('.ad, nav'),
    });
    expect(chunks.map((c) => c.text)).toEqual(['Keep this and this.']);
  });

  it('clips to a selection range that starts and ends mid-block', () => {
    document.body.innerHTML = '<p>Alpha beta gamma.</p><h2>Title</h2><p>Delta epsilon.</p>';
    const map = buildTextNodeMap(document.body);
    const start = map.text.indexOf('beta');
    const end = map.text.indexOf('epsilon');
    const chunks = chunkBlocks(collectBlocks(map, { range: { start, end } }));
    expect(chunks.map((c) => c.text)).toEqual(['beta gamma.', 'Title', 'Delta']);
    expectExactWordOffsets(chunks, map.text);
  });
});
