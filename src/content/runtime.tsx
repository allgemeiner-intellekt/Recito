import { MSG, type ExtensionMessage } from '@shared/messages';
import type { TextChunk } from '@shared/types';
import { extractContent } from './extraction/extractor';
import { getSelectedText } from './extraction/selection';
import {
  canReuseExtraction,
  createExtractionCacheEntry,
  createExtractionCacheKey,
  type ExtractionCacheEntry,
} from './extraction/session-cache';
import { chunkText } from '@shared/chunker';
import { mountToolbar } from './mount';
import { useToolbarStore } from './state/store';
import { getSettings, getProgress } from '@shared/storage';
import { resolveHighlightSettings } from '@shared/accent-colors';
import { PlaybackAnnotations } from './highlighting/playback-annotations';
import { extractWeread, isWeread, type WereadChapter } from './weread/reader';

// Module-level references for native-media detection listeners
let nativeMediaOnPlay: ((this: Document, ev: Event) => void) | null = null;
let nativeMediaOnPauseOrEnd: ((this: Document, ev: Event) => void) | null = null;

// Auto-hide toolbar when native media (video/audio) plays
function setupNativeMediaDetection() {
  // Clean up any previously registered listeners (handles re-injection)
  cleanupNativeMediaDetection();

  const store = useToolbarStore.getState;
  let wasVisibleBeforeMedia = false;

  nativeMediaOnPlay = () => {
    const state = store();
    if (state.toolbarVisible) {
      wasVisibleBeforeMedia = true;
      state.hideToolbar();
    }
  };

  nativeMediaOnPauseOrEnd = () => {
    if (wasVisibleBeforeMedia) {
      wasVisibleBeforeMedia = false;
      store().showToolbar();
    }
  };

  // Capture phase to catch events from all media elements
  document.addEventListener('play', nativeMediaOnPlay, true);
  document.addEventListener('pause', nativeMediaOnPauseOrEnd, true);
  document.addEventListener('ended', nativeMediaOnPauseOrEnd, true);
}

function cleanupNativeMediaDetection(): void {
  if (nativeMediaOnPlay) {
    document.removeEventListener('play', nativeMediaOnPlay, true);
    nativeMediaOnPlay = null;
  }
  if (nativeMediaOnPauseOrEnd) {
    document.removeEventListener('pause', nativeMediaOnPauseOrEnd, true);
    document.removeEventListener('ended', nativeMediaOnPauseOrEnd, true);
    nativeMediaOnPauseOrEnd = null;
  }
}

// Module-level storage for extracted chunks
let currentChunks: TextChunk[] = [];
let selectionScope = false;
let currentExtraction: ExtractionCacheEntry | null = null;

let annotations: PlaybackAnnotations | null = null;
window.addEventListener('recito:return', () => annotations?.returnToReading());

// Mount the floating toolbar into the page

// Listen for settings changes to update highlight colors in real-time
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes['ir-settings']) return;
  try {
    const newSettings = changes['ir-settings'].newValue;
    if (newSettings?.highlight && annotations) {
      const resolved = {
        ...resolveHighlightSettings(newSettings.highlight, newSettings.themeColor ?? null),
        style: newSettings.highlightStyle,
      };
      annotations.updateColors(resolved);
    }
  } catch (err) {
    console.error('[content] Failed to update highlight settings:', err);
  }
});

export async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  const store = useToolbarStore.getState();
  if (
    [MSG.EXTRACT_CONTENT, MSG.SHOW_TOOLBAR, MSG.PLAYBACK_STATE_CHANGED, MSG.START_READING].includes(
      message.type as typeof MSG.EXTRACT_CONTENT,
    )
  ) {
    mountToolbar();
    setupNativeMediaDetection();
  }

  switch (message.type) {
    case MSG.EXTRACT_CONTENT: {
      // Check for text selection first
      const selection = getSelectedText();
      const fromSelection = Boolean(!isWeread() && selection && message.fromSelection !== false);
      selectionScope = fromSelection;
      const extractionKey = createExtractionCacheKey({
        url: window.location.href,
        fromSelection,
        selectionText: selection?.text ?? null,
        chunkConfig: message.chunkConfig,
      });

      if (
        message.startOffset === undefined &&
        !isWeread() &&
        canReuseExtraction(currentExtraction, extractionKey) &&
        currentChunks.length === currentExtraction?.totalChunks
      ) {
        store._setTotalChunks(currentChunks.length);
        store.showToolbar();

        if (!annotations) {
          await initializePlaybackAnnotations(
            selectionScope
              ? document.body
              : ((currentExtraction.sourceElement as Element | null) ?? document.body),
          );
        }

        return {
          title: currentExtraction.title,
          wordCount: currentExtraction.wordCount,
          totalChunks: currentExtraction.totalChunks,
          chunkWordCounts: currentChunks.map((c) => c.wordCount),
          scope: {
            kind: fromSelection ? 'selection' : 'page',
            wordCount: currentExtraction.wordCount,
          },
          excerpt: currentChunks[0]?.text,
          reused: true,
        };
      }

      let textContent: string;
      let title: string;
      let wordCount: number;
      let sourceEl: Element | null = null;
      let wereadChapter: WereadChapter | null = null;

      if (isWeread()) {
        wereadChapter = await extractWeread();
        textContent = wereadChapter.text;
        title = wereadChapter.title;
        wordCount = textContent.length;
        sourceEl = wereadChapter.root;
      } else if (fromSelection && selection) {
        textContent = selection.text;
        title = document.title;
        wordCount = textContent.split(/\s+/).filter(Boolean).length;
      } else {
        const result = extractContent();
        if (!result) {
          return { error: 'Could not extract content from this page.' };
        }
        textContent = result.textContent;
        title = result.title;
        wordCount = result.wordCount;
        sourceEl = result.sourceElement;
      }

      const readingSettings = await getSettings();
      if (!fromSelection && readingSettings.playback.skipReferences) {
        textContent = textContent.split(
          /(?:\n|^)(?:References|Bibliography|Footnotes)\s*(?:\n|$)/i,
        )[0];
        wordCount = textContent.split(/\s+/).filter(Boolean).length;
      }
      currentChunks = chunkText(textContent, message.chunkConfig);
      currentExtraction = createExtractionCacheEntry({
        key: extractionKey,
        title,
        wordCount,
        totalChunks: currentChunks.length,
        sourceElement: sourceEl,
      });

      store._setTotalChunks(currentChunks.length);
      store.showToolbar();

      await initializePlaybackAnnotations(
        wereadChapter ??
          (message.startOffset !== undefined ? document.body : sourceEl) ??
          document.body,
      );

      // Recompute chunk offsets against the DOM text map so highlighting
      // aligns with actual text node positions (Readability's textContent
      // may differ from the live DOM, causing partial-word highlights).
      const domText = annotations?.getFullText() ?? '';
      if (domText) {
        let selectionStart = 0;
        if (fromSelection && selection) {
          const prefix = document.createRange();
          prefix.selectNodeContents(document.body);
          prefix.setEnd(selection.range.startContainer, selection.range.startOffset);
          selectionStart = prefix.toString().length;
        }
        recomputeChunkOffsets(currentChunks, domText, selectionStart);
      }

      return {
        title,
        wordCount,
        totalChunks: currentChunks.length,
        chunkWordCounts: currentChunks.map((c) => c.wordCount),
        scope: { kind: fromSelection ? 'selection' : 'page', wordCount },
        excerpt: currentChunks[0]?.text,
        startChunk:
          message.startOffset === undefined
            ? undefined
            : currentChunks.findIndex(
                (c) => message.startOffset! >= c.startOffset && message.startOffset! < c.endOffset,
              ),
      };
    }

    case MSG.GET_CHUNK: {
      const chunk = currentChunks[message.index];
      if (!chunk) {
        return { error: `Chunk ${message.index} not found` };
      }
      return chunk;
    }

    case MSG.GET_PAGE_INFO: {
      const weread = isWeread() ? await extractWeread() : null;
      const selected = weread ? null : getSelectedText();
      const result = selected || weread ? null : extractContent();
      const text = weread?.text ?? selected?.text ?? result?.textContent ?? '';
      const wordCount = weread ? text.length : text.split(/\s+/).filter(Boolean).length;
      const saved = await getProgress(window.location.href);
      return {
        wordCount,
        scope: { kind: selected ? 'selection' : 'page', wordCount },
        excerpt: text.slice(0, 300),
        savedChunk: selected ? undefined : saved?.chunkIndex,
        savedTotal: selected ? undefined : saved?.totalChunks,
        isPlaying: store.playbackStatus === 'playing',
        currentChunk: store.currentChunkIndex,
        totalChunks: currentChunks.length,
        readable: text.trim().length > 0,
      };
    }
    case MSG.RETURN_TO_READING:
      annotations?.returnToReading();
      return { ok: true };

    case MSG.PLAYBACK_PROGRESS: {
      const progress = message.duration > 0 ? message.currentTime / message.duration : 0;
      store._setChunkProgress(progress, message.currentTime);
      store._setCurrentChunk(message.chunkIndex);
      const chunk = currentChunks[message.chunkIndex];
      if (chunk) annotations?.highlightProgress(chunk, message.currentTime, message.duration);
      // If playback was started outside the content toolbar, the local store
      // may not have seen the loading state before progress starts arriving.
      if (store.playbackStatus === 'loading' || store.playbackStatus === 'idle') {
        store._setPlaybackStatus('playing');
      }
      return { ok: true };
    }

    case MSG.PLAYBACK_STATE_CHANGED: {
      store._syncPlaybackState(message.state);
      return { ok: true };
    }

    case MSG.CHUNK_COMPLETE: {
      store._addChunkDuration(store.currentChunkTime);
      store._setCurrentChunk(message.chunkIndex + 1);
      store._setChunkProgress(0);
      // Clear highlights for completed chunk
      annotations?.clearAll();
      return { ok: true };
    }

    case MSG.WORD_TIMING: {
      const chunk = currentChunks[message.chunkIndex];
      if (chunk) annotations?.highlightWord(chunk, message.word, message.wordIndex);
      return { ok: true };
    }

    case MSG.PLAYBACK_ERROR: {
      console.error('Recito playback error:', message.error);
      store._setPlaybackStatus('error');
      return { ok: true };
    }

    case MSG.START_READING: {
      store._setPlaybackStatus('loading');
      store.showToolbar();
      return { ok: true };
    }

    case MSG.STOP: {
      destroyPlaybackAnnotations();
      cleanupNativeMediaDetection();
      store._setPlaybackStatus('idle');
      return { ok: true };
    }

    case MSG.FAILOVER_NOTICE: {
      if ('toConfigName' in message) {
        store._showToast(
          `${message.fromConfigName ?? 'The current key'} is resting. Switched to ${message.toConfigName}.`,
        );
      }
      return { ok: true };
    }

    case MSG.GET_PAGE_URL: {
      return window.location.href;
    }

    case MSG.RESUME_FROM_PROGRESS: {
      if ('chunkIndex' in message) {
        store._showToast(`Resuming from where you left off`);
      }
      return { ok: true };
    }

    case MSG.SHOW_TOOLBAR: {
      store.showToolbar();
      if (message.error) {
        store._showToast(message.error);
      }
      return { ok: true };
    }
  }
}

function destroyPlaybackAnnotations(): void {
  annotations?.destroy();
  annotations = null;
}

async function initializePlaybackAnnotations(source: Element | WereadChapter): Promise<void> {
  const settings = await getSettings();
  const resolvedHighlight = {
    ...resolveHighlightSettings(settings.highlight, settings.themeColor),
    style: settings.highlightStyle,
  };
  destroyPlaybackAnnotations();
  annotations = new PlaybackAnnotations(source, currentChunks, resolvedHighlight, {
    isActive: () => {
      const status = useToolbarStore.getState().playbackStatus;
      return status === 'playing' || status === 'paused';
    },
    onSeek: (chunkIndex) => useToolbarStore.getState().seekToChunk(chunkIndex),
    onOutsideSelection: selectionScope
      ? (offset) => {
          chrome.runtime.sendMessage({ type: MSG.PLAY, fromSelection: false, startOffset: offset });
        }
      : undefined,
    onInvalidated: () => {
      annotations = null;
      useToolbarStore.getState().stop();
      useToolbarStore.getState()._showToast('章节或排版已变化，请重新启动朗读。');
    },
  });
}

/**
 * Recompute chunk startOffset/endOffset so they refer to positions in `domText`
 * (the concatenated DOM text node map) rather than Readability's textContent.
 * Uses fuzzy matching: for each chunk, search for its text (or a normalised
 * version) in the DOM text near the expected position.
 */
function recomputeChunkOffsets(chunks: TextChunk[], domText: string, start = 0): void {
  let searchFrom = start;

  for (const chunk of chunks) {
    // Try exact match first
    let idx = domText.indexOf(chunk.text, searchFrom);

    if (idx < 0) {
      // Normalise whitespace and try again (DOM text nodes may have different
      // whitespace than Readability output)
      const normChunk = chunk.text.replace(/\s+/g, ' ').trim();
      // Build a regex that matches the chunk words with flexible whitespace
      const words = normChunk.split(' ');
      const pattern = words.map((w) => escapeRegExp(w)).join('\\s+');
      const re = new RegExp(pattern);
      const sub = domText.slice(searchFrom);
      const m = re.exec(sub);
      if (m) {
        idx = searchFrom + m.index;
        // Use the matched length (may differ from chunk.text.length due to whitespace)
        chunk.startOffset = idx;
        chunk.endOffset = idx + m[0].length;
        searchFrom = chunk.endOffset;
        continue;
      }
    }

    if (idx >= 0) {
      chunk.startOffset = idx;
      chunk.endOffset = idx + chunk.text.length;
      searchFrom = chunk.endOffset;
    } else {
      console.warn('[content] Could not locate chunk in DOM text:', chunk.text.slice(0, 50));
    }
    // If neither match works, keep the original offsets as a last resort
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
