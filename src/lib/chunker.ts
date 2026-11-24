import type { TextBlock, TextChunk } from '@shared/types';
import { splitSentenceStrings } from '../content/extraction/sentence-splitter';

export interface ChunkConfig {
  minWords: number;
  maxWords: number;
  splitThreshold: number;
}

const DEFAULT_CONFIG: ChunkConfig = { minWords: 15, maxWords: 25, splitThreshold: 50 };
function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Split a long sentence at clause boundaries (comma, semicolon, em-dash).
 */
function splitAtClauseBoundary(text: string, maxWords: number): string[] {
  // Split at comma/semicolon/em-dash followed by a space
  const parts = text.split(/(?<=[,;\u2014])\s+/);
  if (parts.length <= 1) return [text];

  // Merge parts to stay within target range
  const merged: string[] = [];
  let current = '';

  for (const part of parts) {
    const combined = current ? `${current} ${part}` : part;
    if (countWords(combined) > maxWords && current) {
      merged.push(current.trim());
      current = part;
    } else {
      current = combined;
    }
  }
  if (current.trim()) merged.push(current.trim());

  return merged;
}

/** Split one paragraph into sentences, cutting only very long ones at clauses. */
function splitParagraph(paragraph: string, config: ChunkConfig): string[] {
  const pieces: string[] = [];
  for (const sentence of splitSentenceStrings(paragraph.trim())) {
    if (countWords(sentence) > config.splitThreshold) {
      for (const clause of splitAtClauseBoundary(sentence, config.maxWords)) pieces.push(clause.trim());
    } else {
      pieces.push(sentence.trim());
    }
  }
  return pieces.filter(Boolean);
}

/**
 * Split text into TTS-friendly chunks.
 *
 * Strategy:
 * 1. Split by paragraphs
 * 2. Split each paragraph into sentences
 * 3. Keep each sentence as its own playback segment
 * 4. Split only very long sentences at clause boundaries
 */
export function chunkText(text: string, config: ChunkConfig = DEFAULT_CONFIG): TextChunk[] {
  if (!text.trim()) return [];

  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  const rawChunks = paragraphs.flatMap((para) => splitParagraph(para, config));

  // Build TextChunk array with offsets
  const chunks: TextChunk[] = [];
  let globalOffset = 0;

  for (let i = 0; i < rawChunks.length; i++) {
    const chunkText = rawChunks[i];
    // Find the chunk in the original text starting from globalOffset
    const idx = text.indexOf(chunkText, globalOffset);
    const startOffset = idx >= 0 ? idx : globalOffset;
    const endOffset = startOffset + chunkText.length;

    chunks.push({
      index: i,
      text: chunkText,
      startOffset,
      endOffset,
      wordCount: countWords(chunkText),
    });

    if (idx >= 0) {
      globalOffset = endOffset;
    }
  }

  return chunks;
}

/**
 * Split page blocks into chunks that never cross a block boundary. Headings
 * are always a chunk of their own. Every chunk keeps the DOM offset of each
 * character, so highlighting needs no text search.
 */
export function chunkBlocks(blocks: TextBlock[], config: ChunkConfig = DEFAULT_CONFIG): TextChunk[] {
  const chunks: TextChunk[] = [];
  for (const block of blocks) {
    const pieces = block.heading ? [block.text] : splitParagraph(block.text, config);
    let cursor = 0;
    for (const piece of pieces) {
      const at = block.text.indexOf(piece, cursor);
      if (at < 0) continue;
      cursor = at + piece.length;
      const domOffsets = block.offsets.slice(at, at + piece.length);
      chunks.push({
        index: chunks.length,
        text: piece,
        startOffset: domOffsets[0],
        endOffset: domOffsets[domOffsets.length - 1] + 1,
        wordCount: countWords(piece),
        domOffsets,
      });
    }
  }
  return chunks;
}
