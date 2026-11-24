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

/**
 * Run Readability on a clone and map its verdict back onto live elements.
 *
 * Every clone element gets an attribute whose *name* is unique to it.
 * Readability keeps attributes on the nodes it keeps, and when it unwraps an
 * element it copies the wrapper's attributes onto the child; unique names
 * mean neither identity is overwritten. The live elements whose marker
 * survives are exactly the ones Readability judged to be content.
 */
function readabilityScope(): ContentScope | null {
  const live = document.getElementsByTagName('*');
  const clone = document.cloneNode(true) as Document;
  const cloned = clone.getElementsByTagName('*');
  if (live.length !== cloned.length) return null;
  for (let i = 0; i < cloned.length; i++) cloned[i].setAttribute(`${MARKER}${i}`, '');

  const article = new Readability<Element>(clone, { serializer: (node) => node as Element }).parse();
  if (!article?.textContent || wordCount(article.textContent) <= 30 || !article.content) return null;

  const kept = new Set<Element>();
  const collect = (el: Element) => {
    for (const attr of el.attributes) {
      if (attr.name.startsWith(MARKER)) {
        const liveEl = live[Number(attr.name.slice(MARKER.length))];
        if (liveEl) kept.add(liveEl);
      }
    }
  };
  collect(article.content);
  for (const el of article.content.getElementsByTagName('*')) collect(el);
  if (kept.size === 0) return null;

  return {
    title: article.title || document.title,
    include: (node) => node.parentElement !== null && kept.has(node.parentElement),
    sourceElement: commonAncestor(kept),
  };
}

const MARKER = 'data-recito-';

/** Lowest common ancestor of a set of elements (first and last in document order suffice). */
function commonAncestor(elements: Set<Element>): Element | null {
  let first: Element | null = null;
  let last: Element | null = null;
  for (const el of elements) {
    if (!first || first.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) first = el;
    if (!last || last.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) last = el;
  }
  if (!first || !last) return null;
  let ancestor: Element | null = first;
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
