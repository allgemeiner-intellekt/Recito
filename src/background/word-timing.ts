import { MSG, sendTabMessage } from '@shared/messages';

interface SimpleWordTiming {
  word: string;
  startTime: number;
  endTime: number;
}

// State for the current chunk's word timing
let currentTabId: number | null = null;
let currentChunkIndex = -1;
let currentWords: string[] = [];
let currentWordIndex = 0;
let currentRealTimings: SimpleWordTiming[] | null = null;
let audioDuration = 0;

export function startWordTimingRelay(
  tabId: number,
  chunkIndex: number,
  chunkText: string,
  realTimings?: SimpleWordTiming[],
): void {
  stopWordTimingRelay();

  currentTabId = tabId;
  currentChunkIndex = chunkIndex;
  currentWords = chunkText.split(/\s+/).filter(Boolean);
  currentWordIndex = 0;
  audioDuration = 0;

  if (realTimings && realTimings.length > 0) {
    currentRealTimings = realTimings;
  } else {
    currentRealTimings = null;
  }
}

export function stopWordTimingRelay(): void {
  currentTabId = null;
  currentChunkIndex = -1;
  currentWords = [];
  currentWordIndex = 0;
  currentRealTimings = null;
  audioDuration = 0;
}

/**
 * Called by the orchestrator when a PLAYBACK_PROGRESS message arrives from the offscreen player.
 * This drives word highlighting in sync with actual audio playback.
 */
export function onPlaybackProgress(
  chunkIndex: number,
  currentTime: number,
  duration: number,
): void {
  if (chunkIndex !== currentChunkIndex || !currentTabId || currentWords.length === 0) {
    return;
  }

  if (duration > 0) {
    audioDuration = duration;
  }

  if (currentRealTimings) {
    // Use real timings — advance words whose startTime has been reached
    while (
      currentWordIndex < currentRealTimings.length &&
      currentRealTimings[currentWordIndex].startTime <= currentTime
    ) {
      const timing = currentRealTimings[currentWordIndex];
      sendTabMessage(currentTabId, {
        type: MSG.WORD_TIMING,
        chunkIndex: currentChunkIndex,
        wordIndex: currentWordIndex,
        word: timing.word,
        startTime: timing.startTime,
        endTime: timing.endTime,
      }).catch(() => {});
      currentWordIndex++;
    }
  } else if (audioDuration > 0) {
    // Interpolate based on actual audio duration and current playback time
    const progress = currentTime / audioDuration;
    const expectedWordIndex = Math.min(
      Math.floor(progress * currentWords.length),
      currentWords.length - 1,
    );

    const wordDuration = audioDuration / currentWords.length;

    while (currentWordIndex <= expectedWordIndex) {
      sendTabMessage(currentTabId, {
        type: MSG.WORD_TIMING,
        chunkIndex: currentChunkIndex,
        wordIndex: currentWordIndex,
        word: currentWords[currentWordIndex],
        startTime: currentWordIndex * wordDuration,
        endTime: (currentWordIndex + 1) * wordDuration,
      }).catch(() => {});
      currentWordIndex++;
    }
  }
}
