import type { TextChunk, TextNodeEntry } from '@shared/types';
import type { HighlightManager } from './highlight-manager';
import { chunkSpans } from './utils';
import { useToolbarStore } from '../state/store';

let manager: HighlightManager | null = null;
let chunks: TextChunk[] = [];
let seekCallback: ((chunkIndex: number) => void) | null = null;
let outsideCallback: ((offset: number) => void) | undefined;
let nodeMap: WeakMap<Text, TextNodeEntry> | null = null;
let spansCache = new Map<TextChunk, [number, number][]>();
let lastHoveredChunkIndex = -1;
let rafId = 0;

const HAS_CARET_POSITION = 'caretPositionFromPoint' in document;
const HAS_CARET_RANGE = 'caretRangeFromPoint' in document;

const INTERACTIVE_SELECTOR = 'a, button, input, select, textarea, [role="button"], [role="link"]';

function isPlaybackActive(): boolean {
  const status = useToolbarStore.getState().playbackStatus;
  return status === 'playing' || status === 'paused';
}

/**
 * Get the text node and local offset at a screen coordinate.
 */
function getCaretInfo(x: number, y: number): { node: Text; offset: number } | null {
  // caretPositionFromPoint (standard, Chrome 128+)
  if (HAS_CARET_POSITION) {
    const pos = document.caretPositionFromPoint(x, y);
    if (pos?.offsetNode instanceof Text) {
      return { node: pos.offsetNode, offset: pos.offset };
    }
  }
  // caretRangeFromPoint (WebKit/Blink fallback)
  if (HAS_CARET_RANGE) {
    const range = document.caretRangeFromPoint(x, y);
    if (range?.startContainer instanceof Text) {
      return { node: range.startContainer, offset: range.startOffset };
    }
  }
  return null;
}

/**
 * Map a screen coordinate to a chunk index.
 */
function resolveChunkAtPoint(x: number, y: number): number {
  const caret = getCaretInfo(x, y);
  if (!caret || !nodeMap) return -1;

  const entry = nodeMap.get(caret.node);
  if (!entry) return -1;

  const globalOffset = entry.globalStart + caret.offset;

  for (const chunk of chunks) {
    if (
      globalOffset >= chunk.startOffset &&
      globalOffset < chunk.endOffset &&
      spansOf(chunk).some(([start, end]) => globalOffset >= start && globalOffset < end)
    ) {
      return chunk.index;
    }
  }
  return -1;
}

/** The chunk's highlightable spans, excluding unspoken text inside it. */
function spansOf(chunk: TextChunk): [number, number][] {
  let spans = spansCache.get(chunk);
  if (!spans) {
    spans = chunkSpans(chunk, manager?.getFullText() ?? '');
    spansCache.set(chunk, spans);
  }
  return spans;
}

function onMouseMove(e: MouseEvent): void {
  if (rafId) return; // already scheduled
  rafId = requestAnimationFrame(() => {
    rafId = 0;
    if (!manager || !isPlaybackActive()) {
      if (lastHoveredChunkIndex >= 0) {
        manager?.clearScrubHover();
        document.documentElement.classList.remove('ir-scrub-active');
        lastHoveredChunkIndex = -1;
      }
      return;
    }

    const chunkIndex = resolveChunkAtPoint(e.clientX, e.clientY);

    if (chunkIndex < 0) {
      if (lastHoveredChunkIndex >= 0) {
        manager.clearScrubHover();
        document.documentElement.classList.remove('ir-scrub-active');
        lastHoveredChunkIndex = -1;
      }
      return;
    }

    if (chunkIndex === lastHoveredChunkIndex) return;

    lastHoveredChunkIndex = chunkIndex;
    const chunk = chunks[chunkIndex];
    if (chunk) {
      manager.highlightScrubHover(spansOf(chunk));
      document.documentElement.classList.add('ir-scrub-active');
    }
  });
}

function onClick(e: MouseEvent): void {
  if (!manager || !seekCallback || !isPlaybackActive()) return;
  if (e.defaultPrevented) return;

  // Don't intercept clicks on interactive elements
  const target = e.target as Element | null;
  if (target?.closest(INTERACTIVE_SELECTOR)) return;

  const chunkIndex = resolveChunkAtPoint(e.clientX, e.clientY);
  if (chunkIndex < 0) {
    const caret = getCaretInfo(e.clientX, e.clientY);
    const entry = caret && nodeMap?.get(caret.node);
    if (entry && outsideCallback) outsideCallback(entry.globalStart + caret!.offset);
    return;
  }

  e.preventDefault();
  manager.clearScrubHover();
  document.documentElement.classList.remove('ir-scrub-active');
  lastHoveredChunkIndex = -1;
  seekCallback(chunkIndex);
}

export function initTextScrubber(
  highlightManager: HighlightManager,
  textChunks: TextChunk[],
  onSeek: (chunkIndex: number) => void,
  onOutsideSelection?: (offset: number) => void,
): void {
  destroyTextScrubber();

  manager = highlightManager;
  chunks = textChunks;
  spansCache = new Map();
  seekCallback = onSeek;
  outsideCallback = onOutsideSelection;

  // Build WeakMap for O(1) text node → entry lookup
  nodeMap = new WeakMap<Text, TextNodeEntry>();
  for (const entry of highlightManager.getEntries()) {
    nodeMap.set(entry.node, entry);
  }

  document.addEventListener('mousemove', onMouseMove, { passive: true });
  document.addEventListener('click', onClick, true);
}

export function destroyTextScrubber(): void {
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('click', onClick, true);

  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  manager?.clearScrubHover();
  document.documentElement.classList.remove('ir-scrub-active');

  manager = null;
  chunks = [];
  seekCallback = null;
  outsideCallback = undefined;
  nodeMap = null;
  lastHoveredChunkIndex = -1;
}
