import { describe, expect, it } from 'vitest';
import { chunkBlocks, chunkText } from './chunker';

describe('chunkText', () => {
  it('keeps short sentences as independent playback segments', () => {
    expect(
      chunkText('Hi there. Ok. This is the third sentence.', {
        minWords: 30,
        maxWords: 50,
        splitThreshold: 80,
      }).map((chunk) => chunk.text),
    ).toEqual([
      'Hi there.',
      'Ok.',
      'This is the third sentence.',
    ]);
  });

  it('splits very long sentences at clause boundaries', () => {
    const chunks = chunkText(
      'This sentence is intentionally very long, with several comma-separated parts, so that it crosses the split threshold, and it should become multiple playback segments.',
      {
        minWords: 15,
        maxWords: 8,
        splitThreshold: 10,
      },
    ).map((chunk) => chunk.text);

    expect(chunks).toEqual([
      'This sentence is intentionally very long,',
      'with several comma-separated parts,',
      'so that it crosses the split threshold,',
      'and it should become multiple playback segments.',
    ]);
  });
});

describe('chunkBlocks', () => {
  const block = (text: string, heading = false, base = 100) => ({
    text,
    heading,
    offsets: Array.from(text, (_, i) => base + i * 2),
  });

  it('never merges blocks and never splits headings', () => {
    const chunks = chunkBlocks([block('1. A Title. With dots', true), block('One. Two.', false, 500)]);
    expect(chunks.map((c) => c.text)).toEqual(['1. A Title. With dots', 'One.', 'Two.']);
    expect(chunks.map((c) => c.index)).toEqual([0, 1, 2]);
  });

  it('keeps DOM offsets aligned through clause splitting', () => {
    const text =
      'This sentence is intentionally very long, with several comma-separated parts, so that it crosses the split threshold.';
    const chunks = chunkBlocks([block(text)], { minWords: 15, maxWords: 8, splitThreshold: 10 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const at = text.indexOf(chunk.text);
      expect(chunk.domOffsets).toEqual(block(text).offsets.slice(at, at + chunk.text.length));
      expect(chunk.startOffset).toBe(100 + at * 2);
      expect(chunk.endOffset).toBe(chunk.domOffsets![chunk.domOffsets!.length - 1] + 1);
    }
  });
});

