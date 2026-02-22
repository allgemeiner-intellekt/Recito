import { Readability } from '@mozilla/readability';
import type { ExtractionResult } from '@shared/types';

export function extractGeneric(): ExtractionResult | null {
  // Clone document before Readability parse (it modifies the DOM)
  const clone = document.cloneNode(true) as Document;
  const reader = new Readability(clone);
  const article = reader.parse();

  if (!article) {
    // Fallback: try article root (no body fallback)
    const root = findArticleRoot();
    if (!root) return null;
    const sourceElement = root as HTMLElement;
    const text = sourceElement.innerText;
    if (!text.trim()) return null;
    return {
      title: document.title,
      html: sourceElement.innerHTML,
      textContent: text,
      wordCount: countWords(text),
      sourceElement,
    };
  }

  // Find the source element in the live DOM
  const sourceElement = findArticleRoot();

  // Set textContent to '' — the caller (App.tsx) will use buildTextNodeMap's
  // text instead, guaranteeing offset alignment with the live DOM.
  return {
    title: article.title,
    html: article.content,
    textContent: '',
    wordCount: sourceElement ? countWords((sourceElement as HTMLElement).innerText) : 0,
    sourceElement,
  };
}

export function findArticleRoot(): Element | null {
  // Try common article selectors (most specific first, generic last)
  const selectors = [
    '.mw-parser-output',
    '#mw-content-text',
    'article',
    '[role="main"]',
    'main',
    '.article-body',
    '.post-content',
    '.article-content',
    '.entry-content',
    '.content',
    '#content',
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent && el.textContent.trim().length > 200) {
      return el;
    }
  }

  // No body fallback — return null to signal no article found
  return null;
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}
