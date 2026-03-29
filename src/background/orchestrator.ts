import { MSG, sendTabMessage, type ExtensionMessage } from '@shared/messages';
import type { TextChunk } from '@shared/types';
import { getProvider } from '@providers/registry';
import { getActiveProvider, getSettings } from '@shared/storage';
import { playbackState } from './playback-state';
import { ensureOffscreenDocument } from './offscreen-manager';
import { startWordTimingRelay, stopWordTimingRelay, onPlaybackProgress } from './word-timing';
import { LOOKAHEAD_BUFFER_SIZE } from '@shared/constants';

interface SynthesizedChunk {
  chunkIndex: number;
  audioBase64: string;
  format: string;
  wordTimings?: Array<{ word: string; startTime: number; endTime: number }>;
}

let activeTabId: number | null = null;
const prefetchCache = new Map<number, SynthesizedChunk>();
let abortController: AbortController | null = null;

export function setActiveTab(tabId: number): void {
  activeTabId = tabId;
}

export function getActiveTab(): number | null {
  return activeTabId;
}

// Convert ArrayBuffer to base64 string for Chrome message passing
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Send a message to the offscreen document (uses OFFSCREEN_ prefix to avoid routing loops)
async function sendToOffscreen(message: Record<string, unknown>): Promise<void> {
  await ensureOffscreenDocument();
  chrome.runtime.sendMessage(message).catch(console.error);
}

// Ensure the content script is injected into the tab
async function ensureContentScript(tabId: number): Promise<void> {
  try {
    // Try pinging the content script
    await chrome.tabs.sendMessage(tabId, { type: MSG.GET_PAGE_INFO });
  } catch {
    // Content script not loaded — inject it
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/index.tsx'],
    });
    // Wait briefly for it to initialize
    await new Promise((r) => setTimeout(r, 300));
  }
}

export async function startPlayback(tabId: number, fromSelection = false): Promise<void> {
  // Abort any ongoing playback
  stopPlayback();
  activeTabId = tabId;
  abortController = new AbortController();

  playbackState.setStatus('loading');

  // Ensure content script is available
  try {
    await ensureContentScript(tabId);
  } catch (err) {
    playbackState.setStatus('idle');
    console.error('Cannot inject content script:', err);
    return;
  }

  // Step 1: Extract content from the page
  let extractResult: {
    title?: string;
    wordCount?: number;
    totalChunks?: number;
    error?: string;
  };
  try {
    extractResult = await sendTabMessage(tabId, { type: MSG.EXTRACT_CONTENT, fromSelection });
  } catch (err) {
    playbackState.setStatus('idle');
    console.error('Failed to extract content:', err);
    return;
  }

  if (extractResult.error || !extractResult.totalChunks) {
    playbackState.setStatus('idle');
    console.error('Extraction failed:', extractResult.error ?? 'No content');
    return;
  }

  playbackState.update({
    totalChunks: extractResult.totalChunks,
    currentChunkIndex: 0,
  });

  // Step 2: Start the playback loop
  await playChunksSequentially(tabId, 0, extractResult.totalChunks);
}

export async function resumePlayback(): Promise<void> {
  if (playbackState.getStatus() !== 'paused') return;
  playbackState.setStatus('playing');
  await sendToOffscreen({ type: MSG.OFFSCREEN_RESUME });
}

export function pausePlayback(): void {
  if (playbackState.getStatus() !== 'playing') return;
  playbackState.setStatus('paused');
  stopWordTimingRelay();
  sendToOffscreen({ type: MSG.OFFSCREEN_PAUSE }).catch(() => {});
}

export function stopPlayback(): void {
  abortController?.abort();
  abortController = null;
  prefetchCache.clear();
  stopWordTimingRelay();
  playbackState.reset();
  sendToOffscreen({ type: MSG.OFFSCREEN_STOP }).catch(() => {});
}

export async function skipForward(): Promise<void> {
  const state = playbackState.getState();
  if (state.status === 'idle') return;
  const nextChunk = state.currentChunkIndex + 1;
  if (nextChunk >= state.totalChunks) {
    stopPlayback();
    return;
  }
  await skipToChunk(nextChunk);
}

export async function skipBackward(): Promise<void> {
  const state = playbackState.getState();
  if (state.status === 'idle') return;
  const prevChunk = Math.max(0, state.currentChunkIndex - 1);
  await skipToChunk(prevChunk);
}

async function skipToChunk(chunkIndex: number): Promise<void> {
  if (!activeTabId) return;
  const state = playbackState.getState();

  stopWordTimingRelay();
  await sendToOffscreen({ type: MSG.OFFSCREEN_STOP });

  abortController?.abort();
  abortController = new AbortController();

  playbackState.update({ currentChunkIndex: chunkIndex, status: 'loading' });
  await playChunksSequentially(activeTabId, chunkIndex, state.totalChunks);
}

export function setSpeed(speed: number): void {
  playbackState.update({ speed });
  sendToOffscreen({ type: MSG.OFFSCREEN_SET_SPEED, speed }).catch(() => {});
}

export function setVolume(volume: number): void {
  playbackState.update({ volume });
  sendToOffscreen({ type: MSG.OFFSCREEN_SET_VOLUME, volume }).catch(() => {});
}

async function playChunksSequentially(
  tabId: number,
  startIndex: number,
  totalChunks: number,
): Promise<void> {
  const signal = abortController?.signal;

  for (let i = startIndex; i < totalChunks; i++) {
    if (signal?.aborted) return;

    playbackState.update({ currentChunkIndex: i, status: 'loading' });

    // Synthesize current chunk (or use prefetched)
    let synthesized: SynthesizedChunk;
    const cached = prefetchCache.get(i);
    if (cached) {
      synthesized = cached;
      prefetchCache.delete(i);
    } else {
      try {
        synthesized = await synthesizeChunk(tabId, i);
      } catch (err) {
        if (signal?.aborted) return;
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('Synthesis error:', errorMsg);
        if (activeTabId) {
          sendTabMessage(activeTabId, {
            type: MSG.PLAYBACK_ERROR,
            error: errorMsg,
            chunkIndex: i,
          }).catch(() => {});
        }
        playbackState.setStatus('idle');
        return;
      }
    }

    if (signal?.aborted) return;

    // Start prefetching next chunks
    for (let j = 1; j <= LOOKAHEAD_BUFFER_SIZE; j++) {
      const prefetchIndex = i + j;
      if (prefetchIndex < totalChunks && !prefetchCache.has(prefetchIndex)) {
        synthesizeChunk(tabId, prefetchIndex)
          .then((result) => {
            if (!signal?.aborted) {
              prefetchCache.set(prefetchIndex, result);
            }
          })
          .catch(() => {});
      }
    }

    // Send audio to offscreen as base64 (ArrayBuffer can't be serialized in Chrome messages)
    playbackState.setStatus('playing');
    await sendToOffscreen({
      type: MSG.OFFSCREEN_PLAY,
      audioBase64: synthesized.audioBase64,
      chunkIndex: i,
      format: synthesized.format,
    });

    // Start word timing relay for this chunk
    let chunkResult: TextChunk | null = null;
    try {
      chunkResult = await sendTabMessage<TextChunk>(tabId, {
        type: MSG.GET_CHUNK,
        index: i,
      });
    } catch {
      // Content script may not respond
    }
    if (chunkResult && 'text' in chunkResult) {
      startWordTimingRelay(tabId, i, chunkResult.text, synthesized.wordTimings);
    }

    // Wait for chunk to complete
    await waitForChunkComplete(i, signal);

    if (signal?.aborted) return;
  }

  // All chunks done
  stopPlayback();
}

async function synthesizeChunk(tabId: number, chunkIndex: number): Promise<SynthesizedChunk> {
  // Get chunk text from content script
  const chunk = await sendTabMessage<TextChunk & { error?: string }>(tabId, {
    type: MSG.GET_CHUNK,
    index: chunkIndex,
  });

  if (!chunk || chunk.error || !('text' in chunk)) {
    throw new Error(`Failed to get chunk ${chunkIndex}`);
  }

  // Get active provider and voice
  const providerConfig = await getActiveProvider();
  if (!providerConfig) {
    throw new Error('No TTS provider configured. Please add one in Settings.');
  }

  const settings = await getSettings();
  const provider = getProvider(providerConfig.providerId);

  // Get voice
  const voiceId = settings.activeVoiceId;
  const voices = await provider.listVoices(providerConfig);
  const voice = voices.find((v) => v.id === voiceId) ?? voices[0];

  if (!voice) {
    throw new Error('No voice available for this provider');
  }

  // Synthesize
  const result = await provider.synthesize(chunk.text, voice, providerConfig, {
    speed: playbackState.getState().speed,
  });

  return {
    chunkIndex,
    audioBase64: arrayBufferToBase64(result.audioData),
    format: result.format,
    wordTimings: result.wordTimings,
  };
}

function waitForChunkComplete(
  chunkIndex: number,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const listener = (message: ExtensionMessage) => {
      if (
        message.type === MSG.CHUNK_COMPLETE &&
        'chunkIndex' in message &&
        message.chunkIndex === chunkIndex
      ) {
        chrome.runtime.onMessage.removeListener(listener);
        resolve();
      } else if (
        message.type === MSG.PLAYBACK_ERROR &&
        'chunkIndex' in message &&
        message.chunkIndex === chunkIndex
      ) {
        chrome.runtime.onMessage.removeListener(listener);
        resolve();
      }
    };

    chrome.runtime.onMessage.addListener(listener);

    signal?.addEventListener('abort', () => {
      chrome.runtime.onMessage.removeListener(listener);
      resolve();
    });
  });
}

// Handle progress messages from offscreen
export function handlePlaybackProgress(
  currentTime: number,
  duration: number,
  chunkIndex: number,
): void {
  if (playbackState.getState().currentChunkIndex === chunkIndex) {
    playbackState.update({
      currentTime,
      duration,
      chunkProgress: duration > 0 ? currentTime / duration : 0,
    });
    // Drive word highlighting from real playback progress
    onPlaybackProgress(chunkIndex, currentTime, duration);
  }
}
