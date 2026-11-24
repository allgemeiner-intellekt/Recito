import type { ContentScope, ExtractionResult } from '@shared/types';
import { collectBlocks } from './blocks';
import { buildTextNodeMap } from './dom-mapper';
import { isGmail, extractGmail } from './gmail';
import { isChatSite, extractChat } from './chat';
import { extractGeneric, wordCount } from './generic';

/**
 * Main extraction orchestrator.
 * Order: Gmail → AI chat sites → generic Readability.
 *
 * Chat-specific extraction is checked before the generic path because
 * Readability picks a single top-scoring element, which on chat pages is
 * typically just one message bubble — leaving later replies unread.
 */
export function extractContent(): ExtractionResult | null {
  try {
    const scope = findContentScope();
    if (!scope) return null;
    const textMap = buildTextNodeMap(document.body);
    const blocks = collectBlocks(textMap, { include: scope.include });
    if (blocks.length === 0) return null;
    const textContent = blocks.map((b) => b.text).join('\n\n');
    return {
      title: scope.title,
      include: scope.include,
      blocks,
      textMap,
      textContent,
      wordCount: wordCount(textContent),
      sourceElement: scope.sourceElement,
    };
  } catch (err) {
    console.error('[Recito] Content extraction failed:', err);
    return null;
  }
}

function findContentScope(): ContentScope | null {
  if (isGmail()) {
    const gmailResult = extractGmail();
    if (gmailResult) return gmailResult;
  }

  if (isChatSite()) {
    const chatResult = extractChat();
    if (chatResult) return chatResult;
  }

  return extractGeneric();
}
