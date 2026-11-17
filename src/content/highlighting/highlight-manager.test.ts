// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { HighlightManager } from './highlight-manager';
import { scrollToHighlight } from './auto-scroll';

vi.mock('./auto-scroll', () => ({ scrollToHighlight: vi.fn() }));

it('follows the spoken word even when only the sentence is marked', () => {
  document.body.innerHTML = '<article>A sentence to read.</article>';
  const manager = new HighlightManager({
    style: 'sentence', wordEnabled: false, sentenceEnabled: true, autoScroll: true,
    wordColor: 'blue', sentenceColor: 'lightblue',
  });
  manager.init(document.querySelector('article')!);
  manager.highlightWord(2, 10);
  expect(scrollToHighlight).toHaveBeenCalledWith(expect.any(Range));
  expect(document.querySelector('mark')).toBeNull();
  manager.destroy();
});
