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
  const breaksBefore = lineBreaksBefore(map);

  const raw: { block: Element; heading: boolean; chars: string[]; offsets: number[] }[] = [];
  let lastEnd = -1;
  let lastBox: Element | null = null;
  let lastLayout: Element | null = null;

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
    // Text directly inside a closed <details> (outside its <summary>) is collapsed.
    if (isClosedDetails(parent) || !rendered(parent)) continue;

    // A heading is one block however its inside is laid out; elsewhere the
    // nearest element that starts a new line is the block.
    const layout = blockOf(parent, display);
    const heading = parent.closest(HEADING_SELECTOR);
    const block = heading ?? layout;
    const breaks = breaksBefore.get(entry.node) ?? 0;
    let current = raw[raw.length - 1];
    // Two or more <br> in a row end a paragraph, as a blank line does.
    if (!current || current.block !== block || (breaks >= 2 && !heading)) {
      current = { block, heading: heading !== null, chars: [], offsets: [] };
      raw.push(current);
    }
    const box = inlineBoxOf(parent, layout, display);
    // Nothing visible separates these characters in the DOM, but a skipped
    // node, a <br>, a separate inline box or a line box inside a heading does.
    if (
      current.chars.length > 0 &&
      (entry.globalStart !== lastEnd || breaks > 0 || box !== lastBox || layout !== lastLayout)
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
    lastLayout = layout;
    lastEnd = entry.globalEnd;
  }

  const blocks: TextBlock[] = [];
  for (const { heading, chars, offsets } of raw) {
    const normalized = normalizeWhitespace(chars, offsets);
    if (!normalized.text) continue;
    blocks.push({ ...normalized, heading });
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

/** An open-able <details> that is closed: only its <summary> is shown. */
function isClosedDetails(el: Element): boolean {
  return el.tagName === 'DETAILS' && !(el as HTMLDetailsElement).open;
}

/**
 * Whether an element's text is painted. Collapsed <details> content and
 * hidden elements are skipped: the reader should hear what the user sees.
 */
function createRenderedCache(display: (el: Element) => string): (el: Element) => boolean {
  const laidOutCache = new Map<Element, boolean>();
  const paintedCache = new Map<Element, boolean>();

  // Whether the element takes part in layout, ignoring `visibility`.
  const laidOut = (el: Element): boolean => {
    const cached = laidOutCache.get(el);
    if (cached !== undefined) return cached;
    const parent = el.parentElement;
    let result: boolean;
    if (parent && isClosedDetails(parent) && el.tagName !== 'SUMMARY') {
      result = false;
    } else if (display(el) === 'contents') {
      // No box of its own, so checkVisibility() is always false for it even
      // though its text renders: ask the nearest ancestor that has a box.
      result = !parent || laidOut(parent);
    } else if (typeof el.checkVisibility === 'function') {
      result = el.checkVisibility();
    } else {
      // Fallback for environments without checkVisibility (tests, old Chrome).
      result = display(el) !== 'none' && !(el as HTMLElement).hidden && (!parent || laidOut(parent));
    }
    laidOutCache.set(el, result);
    return result;
  };

  return (el) => {
    let result = paintedCache.get(el);
    if (result === undefined) {
      // Computed visibility is inherited and can be overridden by descendants,
      // so the element's own value decides.
      result = laidOut(el) && getComputedStyle(el).visibility === 'visible';
      paintedCache.set(el, result);
    }
    return result;
  };
}

/** How many <br> elements sit between each text node and the previous one. */
function lineBreaksBefore(map: TextMapResult): Map<Text, number> {
  const result = new Map<Text, number>();
  const root = map.entries[0]?.node.ownerDocument?.body;
  if (!root) return result;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let breaks = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if ((node as Element).tagName === 'BR') breaks++;
    } else if ((node.nodeValue ?? '').trim()) {
      if (breaks > 0) result.set(node as Text, breaks);
      breaks = 0;
    }
  }
  return result;
}
