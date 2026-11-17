import type { PlaybackError, PlaybackState } from './types';

export function errorCopy(error: PlaybackError, provider = 'your provider') {
  const titles = {
    'no-provider': 'No voice connected yet',
    auth: `No working ${provider} key left`,
    'rate-limited': `${provider} needs a moment`,
    network: `Can't reach ${provider}`,
    provider: `${provider} couldn't prepare the voice`,
    extraction: "Can't read this page",
  };
  const details = {
    'no-provider': 'Connect a provider with your own API key to start listening.',
    auth: 'The provider refused your keys. Your place is saved. Check your keys, then try again.',
    'rate-limited':
      'Your keys are resting after a rate limit. Your place is saved. Try again shortly.',
    network: 'Check your connection and try again. Your place is saved.',
    provider: 'The provider returned an error. Your place is saved. Try again or check your keys.',
    extraction: 'Chrome may not let Recito read this page. Try an article or select a passage.',
  };
  return {
    title: titles[error.kind],
    body:
      (error.configNames?.length && ['auth', 'rate-limited'].includes(error.kind)
        ? error.configNames.join(', ') + ': '
        : '') + details[error.kind],
    action: error.kind === 'no-provider' ? 'Set up Recito' : 'Try again',
  };
}
export function progressFraction(s: PlaybackState): number {
  if (s.chunkWordCounts?.length === s.totalChunks) {
    const total = s.chunkWordCounts.reduce((n, count) => n + count, 0);
    const before = s.chunkWordCounts
      .slice(0, s.currentChunkIndex)
      .reduce((n, count) => n + count, 0);
    if (total)
      return Math.min(
        1,
        (before + (s.chunkWordCounts[s.currentChunkIndex] ?? 0) * s.chunkProgress) / total,
      );
  }
  return s.totalChunks ? Math.min(1, (s.currentChunkIndex + s.chunkProgress) / s.totalChunks) : 0;
}
export function readingTimes(s: PlaybackState) {
  const total =
    s.estimatedSeconds ?? (((s.scope?.wordCount ?? 0) / 200) * 60) / Math.max(0.5, s.speed);
  const elapsed = s.elapsedSeconds ?? 0;
  const remaining = Math.max(0, total * (1 - progressFraction(s)));
  return { total: elapsed + remaining, elapsed, remaining };
}
export function formatTime(seconds: number): string {
  const n = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
}
export function minutesLeft(seconds: number): string {
  return `${Math.max(1, Math.ceil(seconds / 60))} min left`;
}
