import type { TextBlock, TextMapResult } from '@shared/types';

export interface CollectBlocksOptions {
  /** Keep only text nodes that belong to the readable content. */
  include?: (node: Text) => boolean;
  /** Keep only characters inside this global offset range (selection mode). */
  range?: { start: number; end: number };
}

const NEVER_READ = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'SELECT']);
const HEADING_SELECTOR = 'h1, h2, h3, h4, h5, h6, [role="heading"]';

/**
 * Group the live text nodes of a text map into visual blocks (headings,
 * paragraphs, list items, ...). Each block carries normalised text plus the
 * global DOM offset of every character, so chunks cut from a block can be
 * highlighted exactly without searching the page for their text.
 */
export function collectBlocks(map: TextMapResult, options: CollectBlocksOptions = {}): TextBlock[] {
  const { include, range } = options;
  const display = createDisplayCache();
  const rendered = createRenderedCache(display);
  const brBefore = textNodesAfterLineBreaks(map);

  const raw: { block: Element; chars: string[]; offsets: number[] }[] = [];
  let lastEnd = -1;
  let lastBox: Element | null = null;

  for (const entry of map.entries) {
    const parent = entry.node.parentElement;
    if (!parent || NEVER_READ.has(parent.tagName)) continue;
    if (include && !include(entry.node)) continue;
    if (range && (entry.globalEnd <= range.start || entry.globalStart >= range.end)) continue;

    const value = entry.node.nodeValue ?? '';
    if (!value.trim()) {
      // Whitespace-only nodes only separate words inside the current block.
      const current = raw[raw.length - 1];
      if (current) {
        current.chars.push(' ');
        current.offsets.push(entry.globalStart);
      }
      lastEnd = entry.globalEnd;
      continue;
    }
    if (!rendered(parent)) continue;

    const block = blockOf(parent, display);
    let current = raw[raw.length - 1];
    if (!current || current.block !== block) {
      current = { block, chars: [], offsets: [] };
      raw.push(current);
    }
    const box = inlineBoxOf(parent, block, display);
    // Nothing visible separates these characters in the DOM, but a skipped
    // node, a <br> or a separate inline box does on screen.
    if (
      current.chars.length > 0 &&
      (entry.globalStart !== lastEnd || brBefore.has(entry.node) || box !== lastBox)
    ) {
      current.chars.push(' ');
      current.offsets.push(entry.globalStart);
    }
    for (let i = 0; i < value.length; i++) {
      const offset = entry.globalStart + i;
      if (range && (offset < range.start || offset >= range.end)) continue;
      current.chars.push(value[i]);
      current.offsets.push(offset);
    }
    lastBox = box;
    lastEnd = entry.globalEnd;
  }

  const blocks: TextBlock[] = [];
  for (const { block, chars, offsets } of raw) {
    const normalized = normalizeWhitespace(chars, offsets);
    if (!normalized.text) continue;
    blocks.push({ ...normalized, heading: block.closest(HEADING_SELECTOR) !== null });
  }
  return blocks;
}

/** Collapse whitespace runs to one space and trim, keeping the offset map aligned. */
function normalizeWhitespace(chars: string[], offsets: number[]): Omit<TextBlock, 'heading'> {
  let text = '';
  const kept: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    if (/\s/.test(chars[i])) {
      if (text && !text.endsWith(' ')) {
        text += ' ';
        kept.push(offsets[i]);
      }
    } else {
      text += chars[i];
      kept.push(offsets[i]);
    }
  }
  if (text.endsWith(' ')) {
    text = text.slice(0, -1);
    kept.pop();
  }
  return { text, offsets: kept };
}

function createDisplayCache(): (el: Element) => string {
  const cache = new Map<Element, string>();
  return (el) => {
    let value = cache.get(el);
    if (value === undefined) {
      value = getComputedStyle(el).display;
      cache.set(el, value);
    }
    return value;
  };
}

function isInline(display: string): boolean {
  return display === '' || display.startsWith('inline') || display === 'contents' || display === 'ruby';
}

/** Nearest ancestor (or self) that starts a new line of text. */
function blockOf(el: Element, display: (el: Element) => string): Element {
  let current = el;
  while (isInline(display(current)) && current.parentElement) current = current.parentElement;
  return current;
}

/** Nearest inline-block-like box inside the block: its edges are word boundaries. */
function inlineBoxOf(el: Element, block: Element, display: (el: Element) => string): Element | null {
  for (let current: Element | null = el; current && current !== block; current = current.parentElement) {
    const value = display(current);
    if (value.startsWith('inline-') || value === 'table-cell') return current;
  }
  return null;
}

/**
 * Whether an element is painted. Collapsed <details> content and hidden
 * elements are skipped: the reader should hear what the user can see.
 */
function createRenderedCache(display: (el: Element) => string): (el: Element) => boolean {
  const cache = new Map<Element, boolean>();
  const check = (el: Element): boolean => {
    const cached = cache.get(el);
    if (cached !== undefined) return cached;
    let result: boolean;
    if (typeof el.checkVisibility === 'function') {
      result = el.checkVisibility({ visibilityProperty: true });
    } else {
      // Fallback for environments without checkVisibility (tests, old Chrome).
      const parent = el.parentElement;
      const closedDetails =
        parent?.tagName === 'DETAILS' && !(parent as HTMLDetailsElement).open && el.tagName !== 'SUMMARY';
      result =
        display(el) !== 'none' && !(el as HTMLElement).hidden && !closedDetails && (!parent || check(parent));
    }
    cache.set(el, result);
    return result;
  };
  return check;
}

function textNodesAfterLineBreaks(map: TextMapResult): Set<Text> {
  const result = new Set<Text>();
  const root = map.entries[0]?.node.ownerDocument?.body;
  if (!root) return result;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let sawBreak = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if ((node as Element).tagName === 'BR') sawBreak = true;
    } else {
      if (sawBreak) result.add(node as Text);
      sawBreak = false;
    }
  }
  return result;
}
