import { expect, it } from 'vitest';
import { errorCopy, formatTime, progressFraction, readingTimes } from './playback-copy';
import type { PlaybackError } from './types';

it.each<PlaybackError['kind']>([
  'no-provider',
  'auth',
  'rate-limited',
  'network',
  'provider',
  'extraction',
])('provides actionable shared wording for %s', (kind) => {
  const copy = errorCopy({ kind, chunkIndex: 2 }, 'OpenAI');
  expect(copy.title.length).toBeGreaterThan(5);
  expect(copy.body.length).toBeGreaterThan(20);
  expect(copy.action).toBe(kind === 'no-provider' ? 'Set up Recito' : 'Try again');
  if (!['extraction', 'no-provider'].includes(kind)) expect(copy.body).toContain('place is saved');
});
it('keeps elapsed time measured while estimating remaining time', () => {
  const state = {
    status: 'playing' as const,
    currentChunkIndex: 2,
    totalChunks: 4,
    chunkProgress: 0.5,
    currentTime: 5,
    duration: 10,
    speed: 1,
    volume: 1,
    scope: { kind: 'selection' as const, wordCount: 200 },
    elapsedSeconds: 22,
  };
  expect(progressFraction(state)).toBe(0.625);
  expect(readingTimes(state)).toEqual({ total: 44.5, elapsed: 22, remaining: 22.5 });
  expect(formatTime(61)).toBe('1:01');
});
