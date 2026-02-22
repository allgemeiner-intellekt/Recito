import { PLAY_BUTTON_WORD_THRESHOLD } from '@shared/constants';

export interface TextBlock {
  element: Element;
  wordCount: number;
}

export function detectTextBlocks(): TextBlock[] {
  const candidates: TextBlock[] = [];
  const selectors = 'article, section, main, [role="main"], .post-content, .article-content, .entry-content';
  const containers = document.querySelectorAll(selectors);

  // Also check large paragraphs directly
  const allParagraphs = document.querySelectorAll('p');

  const seen = new Set<Element>();

  // Check containers first
  for (const container of containers) {
    const text = container.textContent?.trim() ?? '';
    const wordCount = countWords(text);
    if (wordCount >= PLAY_BUTTON_WORD_THRESHOLD) {
      candidates.push({ element: container, wordCount });
      seen.add(container);
    }
  }

  // Check paragraphs not inside already-detected blocks
  for (const p of allParagraphs) {
    // Skip if inside an already-detected container
    let inside = false;
    for (const block of candidates) {
      if (block.element.contains(p)) {
        inside = true;
        break;
      }
    }
    if (inside) continue;

    const text = p.textContent?.trim() ?? '';
    const wordCount = countWords(text);
    if (wordCount >= PLAY_BUTTON_WORD_THRESHOLD && !seen.has(p)) {
      candidates.push({ element: p, wordCount });
      seen.add(p);
    }
  }

  return candidates;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}
