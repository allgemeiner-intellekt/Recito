import React from 'react';
import type { PlaybackState } from '@shared/types';

interface ProgressBarProps {
  playback: PlaybackState;
  isPaused: boolean;
  onTogglePause: () => void;
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

const PlayIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M4 2.5L13 8L4 13.5V2.5Z" fill="currentColor" />
  </svg>
);

const PauseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <rect x="3" y="2" width="4" height="12" rx="1" fill="currentColor" />
    <rect x="9" y="2" width="4" height="12" rx="1" fill="currentColor" />
  </svg>
);

const RING_SIZE = 44;
const RING_RADIUS = 19;
const RING_STROKE = 3;
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function ProgressBar({ playback, isPaused, onTogglePause }: ProgressBarProps) {
  const { elapsedTime, estimatedTotalTime } = playback;

  const overallProgress = estimatedTotalTime > 0
    ? (elapsedTime / estimatedTotalTime) * 100
    : 0;

  const remaining = Math.max(0, estimatedTotalTime - elapsedTime);
  const dashOffset = CIRCUMFERENCE * (1 - Math.min(100, overallProgress) / 100);

  return (
    <div className="ir-progress-container">
      <span className="ir-time-remaining">{formatTime(remaining)}</span>
      <div className="ir-progress-ring-container">
        <svg
          className="ir-progress-ring"
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
        >
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="#E5E5E5"
            strokeWidth={RING_STROKE}
          />
          <circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke="#1A1A1A"
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
            style={{ transition: 'stroke-dashoffset 0.1s linear' }}
          />
        </svg>
        <button
          className="ir-btn ir-btn-primary"
          onClick={onTogglePause}
          aria-label={isPaused ? 'Resume' : 'Pause'}
        >
          {isPaused ? <PlayIcon /> : <PauseIcon />}
        </button>
      </div>
    </div>
  );
}
