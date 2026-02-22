import { WORDS_PER_MINUTE } from '@shared/constants';
import type { WordTiming } from '@shared/types';

export function estimateWordTimings(
  text: string,
  actualDuration?: number
): WordTiming[] {
  const words: { word: string; charStart: number; charEnd: number }[] = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    words.push({
      word: match[0],
      charStart: match.index,
      charEnd: match.index + match[0].length,
    });
  }

  if (words.length === 0) return [];

  const totalChars = words.reduce((sum, w) => sum + w.word.length, 0);
  const duration = actualDuration && actualDuration > 0
    ? actualDuration
    : (words.length / WORDS_PER_MINUTE) * 60;

  const timings: WordTiming[] = [];
  let currentTime = 0;

  for (const w of words) {
    const proportion = w.word.length / totalChars;
    const wordDuration = duration * proportion;
    timings.push({
      word: w.word,
      startTime: currentTime,
      endTime: currentTime + wordDuration,
      charStart: w.charStart,
      charEnd: w.charEnd,
    });
    currentTime += wordDuration;
  }

  return timings;
}

export function findWordAtTime(timings: WordTiming[], currentTime: number): number {
  for (let i = 0; i < timings.length; i++) {
    if (currentTime >= timings[i].startTime && currentTime < timings[i].endTime) {
      return i;
    }
  }
  // If past all timings, return last word
  if (timings.length > 0 && currentTime >= timings[timings.length - 1].startTime) {
    return timings.length - 1;
  }
  return 0;
}
