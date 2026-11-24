import { MSG, type ExtensionMessage } from '@shared/messages';
import type { TextBlock, TextChunk, TextMapResult } from '@shared/types';
import { extractContent } from './extraction/extractor';
import { getSelectedText } from './extraction/selection';
import {
  canReuseExtraction,
  createExtractionCacheEntry,
  createExtractionCacheKey,
  type ExtractionCacheEntry,
} from './extraction/session-cache';
import { chunkBlocks, chunkText } from '@shared/chunker';
import { collectBlocks } from './extraction/blocks';
import { buildTextNodeMap } from './extraction/dom-mapper';
import { wordCount as countWords } from './extraction/generic';
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
/** Text map of document.body that page/selection chunk offsets refer to. */
let currentTextMap: TextMapResult | null = null;
/** Content filter and spoken text of the cached page extraction, to detect page changes. */
let currentInclude: ((node: Text) => boolean) | null = null;
let currentSpokenText = '';
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
      const readingSettings = await getSettings();
      const extractionKey = createExtractionCacheKey({
        url: window.location.href,
        fromSelection,
        selectionText: selection?.text ?? null,
        chunkConfig: message.chunkConfig,
        skipReferences: readingSettings.playback.skipReferences,
      });

      if (
        message.startOffset === undefined &&
        !fromSelection &&
        !isWeread() &&
        canReuseExtraction(currentExtraction, extractionKey) &&
        currentChunks.length === currentExtraction?.totalChunks &&
        currentTextMap &&
        currentInclude &&
        isTextMapIntact(currentTextMap) &&
        spokenText(
          skipReferences(
            collectBlocks(currentTextMap, { include: currentInclude }),
            readingSettings.playback.skipReferences,
          ),
        ) === currentSpokenText
      ) {
        store._setTotalChunks(currentChunks.length);
        store.showToolbar();

        if (!annotations) {
          await initializePlaybackAnnotations(document.body, currentTextMap);
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

      let title: string;
      let wordCount: number;
      let sourceEl: Element | null = null;

      if (isWeread()) {
        const chapter = await extractWeread();
        title = chapter.title;
        wordCount = chapter.text.length;
        const text = readingSettings.playback.skipReferences
          ? chapter.text.split(/(?:\n|^)(?:References|Bibliography|Footnotes)\s*(?:\n|$)/i)[0]
          : chapter.text;
        currentChunks = chunkText(text, message.chunkConfig);
        currentTextMap = null;
        currentInclude = null;
        currentExtraction = createExtractionCacheEntry({
          key: extractionKey,
          title,
          wordCount,
          totalChunks: currentChunks.length,
          sourceElement: chapter.root,
        });
        store._setTotalChunks(currentChunks.length);
        store.showToolbar();
        await initializePlaybackAnnotations(chapter);
      } else {
        let blocks: TextBlock[];
        let textMap: TextMapResult;
        let include: ((node: Text) => boolean) | null = null;
        if (fromSelection && selection) {
          textMap = buildTextNodeMap(document.body);
          blocks = collectBlocks(textMap, {
            range: {
              start: bodyTextOffset(selection.range.startContainer, selection.range.startOffset),
              end: bodyTextOffset(selection.range.endContainer, selection.range.endOffset),
            },
          });
          title = document.title;
        } else {
          const result = extractContent();
          if (!result) {
            return { error: 'Could not extract content from this page.' };
          }
          title = result.title;
          textMap = result.textMap;
          blocks = skipReferences(result.blocks, readingSettings.playback.skipReferences);
          include = result.include;
          sourceEl = result.sourceElement;
        }
        if (blocks.length === 0) {
          return { error: 'There is no visible text to read here.' };
        }
        currentSpokenText = spokenText(blocks);
        wordCount = countWords(currentSpokenText);
        currentChunks = chunkBlocks(blocks, message.chunkConfig);
        currentTextMap = textMap;
        currentInclude = include;
        currentExtraction = createExtractionCacheEntry({
          key: extractionKey,
          title,
          wordCount,
          totalChunks: currentChunks.length,
          sourceElement: sourceEl,
        });
        store._setTotalChunks(currentChunks.length);
        store.showToolbar();
        await initializePlaybackAnnotations(document.body, textMap);
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
            : Math.max(
                0,
                currentChunks.findIndex((c) => c.endOffset > message.startOffset!),
              ),
      };
    }

    case MSG.GET_CHUNK: {
      const chunk = currentChunks[message.index];
      if (!chunk) {
        return { error: `Chunk ${message.index} not found` };
      }
      // DOM offsets only matter for highlighting in this tab.
      const { index, text, startOffset, endOffset, wordCount } = chunk;
      return { index, text, startOffset, endOffset, wordCount };
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

async function initializePlaybackAnnotations(
  source: Element | WereadChapter,
  textMap?: TextMapResult,
): Promise<void> {
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
  }, textMap);
}

/** Global offset of a DOM position in the text map of document.body. */
function bodyTextOffset(container: Node, offset: number): number {
  const prefix = document.createRange();
  prefix.selectNodeContents(document.body);
  prefix.setEnd(container, offset);
  return prefix.toString().length;
}

/** Whether every text node in the map is still on the page with the same text. */
function isTextMapIntact(map: TextMapResult): boolean {
  return map.entries.every(
    (e) => e.node.isConnected && e.node.nodeValue === map.text.slice(e.globalStart, e.globalEnd),
  );
}

/** Drop everything from a standalone References/Bibliography/Footnotes block on. */
function skipReferences(blocks: TextBlock[], enabled: boolean): TextBlock[] {
  if (!enabled) return blocks;
  const end = blocks.findIndex((b) => /^(?:References|Bibliography|Footnotes)$/i.test(b.text));
  return end >= 0 ? blocks.slice(0, end) : blocks;
}

function spokenText(blocks: TextBlock[]): string {
  return blocks.map((b) => b.text).join('\n\n');
}
