import { describe, expect, it } from 'vitest';
import { assembleChapter, type CapturedRun } from './model';
import { chunkText } from '@shared/chunker';

// WeRead may position words using layout gaps rather than measurable space
// glyphs. Reproduce that seam using real assembly and playback chunking.
function positionedLines(lines: string[]): CapturedRun[] {
  return lines.flatMap((line, row) => {
    let x = 0;
    const runs: CapturedRun[] = [];
    for (const text of line) {
      if (!/\s/.test(text)) runs.push({ text, x, y: row * 30, width: 8, height: 20, baseline: row * 30 + 10 });
      x += 8;
    }
    return runs;
  });
}

describe('WeRead layout reconstruction', () => {
  it('sorts mixed language by geometry and preserves sentence offsets', () => {
    const run = (text: string, x: number, baseline: number) => ({ text, x, y: baseline - 10, baseline, width: 20, height: 20 });
    const chapter = assembleChapter([run('。', 20, 40), run('好', 0, 40), run('world', 80, 0), run('Hello', 0, 0)]);
    expect(chapter.text).toBe('Hello world好。');
    for (const item of chapter.runs) expect(chapter.text.slice(item.startOffset, item.endOffset)).toBe(item.text);
  });

  it('preserves the word boundary after a comma so highlighting does not combine two words', () => {
    const chapter = assembleChapter(positionedLines(['One day, he tried it. It worked.']));
    expect(chapter.text).toBe('One day, he tried it. It worked.');
    expect(chunkText(chapter.text).map(chunk => chunk.text)).toEqual(['One day, he tried it.', 'It worked.']);
    expect(chapter.text.split(/\s+/)).toContain('day,');
    expect(chapter.text.split(/\s+/)).toContain('he');
    for (const run of chapter.runs) expect(chapter.text.slice(run.startOffset, run.endOffset)).toBe(run.text);
  });

  it('preserves boundaries after punctuation and closing quotes across wrapped lines', () => {
    const chapter = assembleChapter(positionedLines(['He did this,', 'usually when stuck.', 'He’d developed the habit.']));
    expect(chapter.text).toBe('He did this, usually when stuck. He’d developed the habit.');
  });

  it('keeps contractions, hyphens, and decimals intact while separating quoted speech', () => {
    const text = '“Hello,” she said. He’d built state-of-the-art tools—quickly. It cost 3.14 dollars.';
    expect(assembleChapter(positionedLines([text])).text).toBe(text);
  });

  it('does not add spaces to Chinese punctuation or split hyphenated words at a line wrap', () => {
    expect(assembleChapter(positionedLines(['你好， 世界。再见！'])).text).toBe('你好，世界。再见！');
    expect(assembleChapter(positionedLines(['Hessian–', 'free optimizers work.'])).text).toBe('Hessian–free optimizers work.');
  });

  it('distinguishes small English word spaces from glyph kerning and preserves existing spaces', () => {
    const run = (text: string, x: number, width: number) => ({ text, x, y: 0, width, height: 29.5, baseline: 15 });
    expect(assembleChapter([run('word,', 0, 40), run('next', 45.5, 32)]).text).toBe('word, next');
    expect(assembleChapter([run('w', 0, 8), run('o', 8.5, 8), run('r', 17, 8), run('d', 25.5, 8)]).text).toBe('word');
    expect(assembleChapter([run('word, ', 0, 46), run('next', 46, 32)]).text).toBe('word, next');
  });

  it('uses a collapsed source space even when layout alone cannot recover the boundary', () => {
    const runs = positionedLines(['word,next']);
    runs[5].spaceBefore = true;
    expect(assembleChapter(runs).text).toBe('word, next');
  });
});
