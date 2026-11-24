import { Readability } from '@mozilla/readability';
import type { ContentScope } from '@shared/types';

// Selectors for elements that should be stripped before scoring
const NOISE_SELECTORS = [
  'nav', 'footer', 'header', 'aside',
  '[role="banner"]', '[role="navigation"]', '[role="complementary"]',
  '.cookie-banner', '.cookie-notice', '.ad', '.ads', '.advertisement',
  '.sidebar', '.social-share', '.related-posts', '.comments',
  '#comments', '.newsletter-signup', '.promo',
  'script', 'style', 'noscript', 'iframe',
];

// High-confidence article selectors
const HIGH_CONFIDENCE_SELECTORS = [
  '.mw-parser-output',
  '[itemprop="articleBody"]',
  '[data-article-body]',
];

// Broader candidate selectors, in rough priority order
const CANDIDATE_SELECTORS = [
  'article',
  '[role="main"]',
  'main',
  '.article-body',
  '.article-content',
  '.post-content',
  '.post-body',
  '.entry-content',
  '.story-body',
  '.content-body',
  '.page-content',
  '#article-body',
  '#content',
  '.content',
];

const wordSegmenter = new Intl.Segmenter(undefined, { granularity: 'word' });

export function wordCount(text: string): number {
  // Whitespace splitting counts an entire Chinese paragraph as one word.
  // Use word boundaries for both minimum-length checks and density scoring.
  let count = 0;
  for (const segment of wordSegmenter.segment(text)) {
    if (segment.isWordLike) count++;
  }
  return count;
}

function stripNoise(root: Element): void {
  for (const sel of NOISE_SELECTORS) {
    root.querySelectorAll(sel).forEach((el) => el.remove());
  }
}

function scoreCandidate(el: Element): number {
  const text = (el as HTMLElement).innerText ?? el.textContent ?? '';
  const words = wordCount(text);

  // Base score: word count (more content = better)
  let score = words;

  // Tag bonus
  const tag = el.tagName.toLowerCase();
  if (tag === 'article') score += 25;
  if (tag === 'main') score += 15;

  // Class/id signals
  const classAndId = `${el.className} ${el.id}`.toLowerCase();
  if (/article|post|entry|story|content/.test(classAndId)) score += 20;
  if (/comment|sidebar|footer|header|nav|menu|ad/.test(classAndId)) score -= 30;

  // Paragraph density: boost elements with many <p> children
  const paragraphs = el.querySelectorAll('p');
  const paragraphText = Array.from(paragraphs)
    .map((p) => p.textContent ?? '')
    .join(' ');
  const paragraphWords = wordCount(paragraphText);
  if (words > 0) {
    const density = paragraphWords / words;
    score += density * 30;
  }

  // Link density penalty: high ratio of link text = navigation, not content
  const links = el.querySelectorAll('a');
  const linkText = Array.from(links)
    .map((a) => a.textContent ?? '')
    .join(' ');
  const linkWords = wordCount(linkText);
  if (words > 0) {
    const linkDensity = linkWords / words;
    if (linkDensity > 0.5) score -= 50;
    else if (linkDensity > 0.3) score -= 20;
  }

  return score;
}

/**
 * Heuristic fallback: find the most likely article root by scoring candidates.
 */
function findArticleRoot(): Element | null {
  // Try high-confidence selectors first
  for (const sel of HIGH_CONFIDENCE_SELECTORS) {
    const el = document.querySelector(sel);
    if (el && wordCount(el.textContent ?? '') > 50) return el;
  }

  // Score broader candidates
  let bestEl: Element | null = null;
  let bestScore = -Infinity;

  for (const sel of CANDIDATE_SELECTORS) {
    const elements = document.querySelectorAll(sel);
    for (const el of elements) {
      const s = scoreCandidate(el);
      if (s > bestScore) {
        bestScore = s;
        bestEl = el;
      }
    }
  }

  // Only accept if score is reasonable
  if (bestEl && bestScore > 50) return bestEl;

  return null;
}

const MARKER = 'data-recito-';

/**
 * Run Readability on a clone and map its verdict back onto live text nodes.
 *
 * Two identities link the clone to the live page, because Readability breaks
 * each one in some case:
 * - Text nodes. `cloneNode(true)` keeps text nodes in order, so a parallel
 *   walk pairs each clone text node with its live original. Readability moves
 *   text nodes even when it rebuilds the elements around them.
 * - Element markers. Each clone element gets an attribute whose *name* is
 *   unique to it. When Readability's first attempt finds too little it
 *   re-parses the page from HTML, which recreates every text node but keeps
 *   attributes. (Unique names matter because unwrapping copies a wrapper's
 *   attributes onto its child.) A recreated text node is matched, by value and
 *   in order, against the text of its nearest marked ancestor's live element.
 */
function readabilityScope(): ContentScope | null {
  const live = document.getElementsByTagName('*');
  const clone = document.cloneNode(true) as Document;
  const cloned = clone.getElementsByTagName('*');
  if (live.length !== cloned.length) return null;
  for (let i = 0; i < cloned.length; i++) cloned[i].setAttribute(`${MARKER}${i}`, '');

  const liveOf = new Map<Node, Text>();
  const liveWalker = document.createTreeWalker(document, NodeFilter.SHOW_TEXT);
  const cloneWalker = clone.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  for (
    let original = liveWalker.nextNode(), copy = cloneWalker.nextNode();
    original && copy;
    original = liveWalker.nextNode(), copy = cloneWalker.nextNode()
  ) {
    liveOf.set(copy, original as Text);
  }

  const article = new Readability<Element>(clone, { serializer: (node) => node as Element }).parse();
  if (!article?.textContent || wordCount(article.textContent) <= 30 || !article.content) return null;

  const kept = new Set<Text>();
  const matcher = createTextMatcher(live);
  const walker = clone.createTreeWalker(article.content, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue?.trim()) continue;
    const original = liveOf.get(node) ?? matcher(node as Text);
    if (original) kept.add(original);
  }
  if (kept.size === 0) return null;

  return {
    title: article.title || document.title,
    include: (node) => kept.has(node),
    sourceElement: commonAncestor(kept),
  };
}

/**
 * Find the live text node a recreated clone text node stands for: the next
 * unmatched text node with the same value inside the live counterpart of its
 * nearest marked ancestor.
 */
function createTextMatcher(live: HTMLCollectionOf<Element>): (node: Text) => Text | null {
  const cursors = new Map<Element, { nodes: Text[]; next: number }>();
  return (node) => {
    const owner = markedOwner(node, live);
    if (!owner) return null;
    let cursor = cursors.get(owner);
    if (!cursor) {
      const nodes: Text[] = [];
      const walker = document.createTreeWalker(owner, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
      cursor = { nodes, next: 0 };
      cursors.set(owner, cursor);
    }
    for (let i = cursor.next; i < cursor.nodes.length; i++) {
      if (cursor.nodes[i].nodeValue === node.nodeValue) {
        cursor.next = i + 1;
        return cursor.nodes[i];
      }
    }
    return null;
  };
}

/** Live element of the nearest marked ancestor (its own marker is the highest index). */
function markedOwner(node: Node, live: HTMLCollectionOf<Element>): Element | null {
  for (let el = node.parentElement; el; el = el.parentElement) {
    let index = -1;
    for (const attr of el.attributes) {
      if (attr.name.startsWith(MARKER)) index = Math.max(index, Number(attr.name.slice(MARKER.length)));
    }
    if (index >= 0) return live[index] ?? null;
  }
  return null;
}

/** Lowest common ancestor element of a set of nodes (first and last in document order suffice). */
function commonAncestor(nodes: Set<Node>): Element | null {
  let first: Node | null = null;
  let last: Node | null = null;
  for (const node of nodes) {
    if (!first || first.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING) first = node;
    if (!last || last.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) last = node;
  }
  if (!first || !last) return null;
  let ancestor: Element | null = first.parentElement;
  while (ancestor && !ancestor.contains(last)) ancestor = ancestor.parentElement;
  return ancestor;
}

/**
 * Find the article content: Readability first, then a heuristic root with
 * noise (navigation, ads, comments...) excluded.
 */
export function extractGeneric(): ContentScope | null {
  try {
    const scope = readabilityScope();
    if (scope) return scope;
  } catch {
    // Readability failed, fall through to heuristic
  }

  const root = findArticleRoot();
  if (!root) return null;

  // Clone root and strip noise to decide whether there is enough prose
  const cleanRoot = root.cloneNode(true) as Element;
  stripNoise(cleanRoot);
  const textContent = (cleanRoot as HTMLElement).innerText?.trim() ?? cleanRoot.textContent?.trim() ?? '';
  if (!textContent || wordCount(textContent) < 30) return null;

  const noise = NOISE_SELECTORS.join(',');
  return {
    title: document.title,
    include: (node) => {
      const parent = node.parentElement;
      if (!parent || !root.contains(parent)) return false;
      const noisy = parent.closest(noise);
      return !noisy || noisy === root || !root.contains(noisy);
    },
    sourceElement: root,
  };
}
