import type { TextChunk, TextNodeEntry } from '@shared/types';

/**
 * Create a DOM Range spanning the text between `startOffset` and `endOffset`
 * (global character offsets within the concatenated text from buildTextNodeMap).
 */
export function createRangeFromOffsets(
  entries: TextNodeEntry[],
  startOffset: number,
  endOffset: number,
): Range | null {
  if (entries.length === 0 || startOffset >= endOffset) return null;

  let startNode: Text | null = null;
  let startLocal = 0;
  let endNode: Text | null = null;
  let endLocal = 0;

  for (const entry of entries) {
    if (!startNode && startOffset < entry.globalEnd) {
      startNode = entry.node;
      startLocal = startOffset - entry.globalStart;
    }
    if (endOffset <= entry.globalEnd) {
      endNode = entry.node;
      endLocal = endOffset - entry.globalStart;
      break;
    }
  }

  if (!startNode || !endNode) return null;

  try {
    const range = document.createRange();
    range.setStart(startNode, Math.max(0, startLocal));
    range.setEnd(endNode, Math.min(endLocal, endNode.length));
    return range;
  } catch {
    return null;
  }
}

/**
 * DOM spans covering `chunk.text[start, end)`. A span breaks wherever page
 * text that is not spoken (a skipped button, ad or hidden note) lies between
 * two characters, so highlights never paint over it. Collapsed whitespace
 * does not break a span.
 */
export function chunkSpans(
  chunk: TextChunk,
  fullText: string,
  start = 0,
  end = chunk.text.length,
): [number, number][] {
  const offsets = chunk.domOffsets;
  if (!offsets || offsets.length === 0) {
    return [[chunk.startOffset + start, chunk.startOffset + end]];
  }
  const from = Math.max(0, Math.min(start, offsets.length - 1));
  const to = Math.max(from + 1, Math.min(end, offsets.length));
  const spans: [number, number][] = [];
  let spanStart = offsets[from];
  let previous = offsets[from];
  for (let i = from + 1; i < to; i++) {
    const offset = offsets[i];
    if (offset > previous + 1 && /\S/.test(fullText.slice(previous + 1, offset))) {
      spans.push([spanStart, previous + 1]);
      spanStart = offset;
    }
    previous = Math.max(previous, offset);
  }
  spans.push([spanStart, previous + 1]);
  return spans;
}
