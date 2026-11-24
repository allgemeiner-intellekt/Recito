// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Readability } from '@mozilla/readability';
import { extractContent } from './extractor';

const passage = '本专辑叫哲学入门，想告诉大家怎么从完全不懂哲学，或者对哲学抱有很大偏见——这偏见不是主动获取的，而是高中和社会上庸俗的传媒舆论塑造的传统形象所固化的——去除这种错误的理解，重新认识到哲学对自己生活的价值和意义。';

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('Chinese article extraction', () => {
  it('extracts Chinese prose without requiring spaces between words', () => {
    document.body.innerHTML = `<article><p>${passage.repeat(6)}</p></article>`;
    const result = extractContent();
    expect(result, 'Could not extract content from this page.').not.toBeNull();
    expect(result?.textContent).toContain(passage);
    expect(document.querySelector('article')!.contains(result!.sourceElement)).toBe(true);
  });

  it('extracts Chinese prose through the heuristic fallback', () => {
    vi.spyOn(Readability.prototype, 'parse').mockReturnValue(null);
    document.body.innerHTML = `<main><div data-article-body><p>${passage.repeat(6)}</p></div></main>`;
    const result = extractContent();
    expect(result?.textContent).toContain(passage);
    expect(result?.sourceElement).toBe(document.querySelector('[data-article-body]'));
    expect(result?.wordCount).toBeGreaterThan(30);
  });

  it('still extracts English articles', () => {
    const english = 'This article explains how people learn to read and think about the world. '.repeat(10);
    document.body.innerHTML = `<article><p>${english}</p></article>`;
    expect(extractContent()?.textContent).toContain(english.trim());
  });

  it.each(['返回笔记库 我的阅读', 'Home Sign in', '，。！？'.repeat(200)])(
    'rejects insufficient prose: %s', (text) => {
      document.body.innerHTML = `<article><p>${text}</p></article>`;
      expect(extractContent()).toBeNull();
    },
  );
});

describe('block extraction', () => {
  const prose = (n: number) =>
    Array.from({ length: n }, (_, i) => `Sentence number ${i + 1} explains how markets price new technology.`).join(' ');

  it('reads Readability content as separate blocks, without page chrome', () => {
    document.body.innerHTML =
      '<header><nav><a href="/">Home</a><a href="/about">About us</a></nav></header>' +
      '<main><article><h1>The Trillion Paradox</h1><h2>Introduction</h2>' +
      `<p>${prose(6)}</p><p>${prose(5)}</p></article></main>` +
      '<footer><p>Terms of Service and Privacy Policy</p></footer>';
    const result = extractContent()!;
    const texts = result.blocks.map((b) => b.text);
    expect(texts).toContain('Introduction');
    expect(texts.find((t) => t.startsWith('Sentence number 1 '))).toBeDefined();
    expect(result.textContent).not.toContain('About us');
    expect(result.textContent).not.toContain('Privacy Policy');
    expect(result.blocks.find((b) => b.text === 'Introduction')?.heading).toBe(true);
  });

  it('keeps plain-text divs that Readability rebuilds as new paragraphs', () => {
    document.body.innerHTML = `<article><div>${prose(6).replace(/Sentence/g, 'Div')}</div><p>${prose(6)}</p></article>`;
    expect(extractContent()!.textContent).toContain('Div number 1 ');
    document.body.innerHTML = `<article><div>${prose(8)}</div></article>`;
    expect(extractContent()?.textContent).toContain('Sentence number 8 ');
  });

  it('maps content back when Readability rebuilds the page from HTML', () => {
    // When its first attempt finds too little text, Readability re-parses the
    // page from an HTML string: every text node is new, attributes survive.
    const parse = Readability.prototype.parse;
    vi.spyOn(Readability.prototype, 'parse').mockImplementation(function (this: Readability) {
      const article = parse.call(this);
      const content = article?.content as unknown as Element | undefined;
      if (content) {
        const html = content.innerHTML;
        content.innerHTML = html;
      }
      return article;
    });
    document.body.innerHTML =
      `<div><h1>Rebuilt</h1><p>${prose(6)}</p><div class="share-buttons"><a href="#">Share</a> <a href="#">Tweet</a></div></div>`;
    const result = extractContent();
    expect(result?.textContent).toContain('Sentence number 6 ');
    expect(result?.textContent).not.toContain('Tweet');
  });

  it('keeps content that Readability unwraps from nested wrappers', () => {
    document.body.innerHTML =
      `<article><div class="wrap"><div class="inner"><p>${prose(4)}</p></div></div>` +
      `<div class="wrap"><section><p>${prose(4).replace(/Sentence/g, 'Clause')}</p></section></div></article>`;
    const result = extractContent()!;
    expect(result.textContent).toContain('Sentence number 4 ');
    expect(result.textContent).toContain('Clause number 4 ');
  });

  it('points every block character at the same character on the page', () => {
    document.body.innerHTML = `<article><h2>Heading</h2><p>\n  ${prose(6)}\n</p></article>`;
    const result = extractContent()!;
    for (const block of result.blocks) {
      const fromPage = block.offsets.map((o) => result.textMap.text[o]).join('');
      expect(fromPage.replace(/\s/g, ' ')).toBe(block.text);
    }
  });
});

