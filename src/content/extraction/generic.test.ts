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
    expect(result?.sourceElement).toBe(document.querySelector('article'));
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
