import React from 'react';
import type { PlaybackState } from '@shared/types';

interface ProgressBarProps {
  playback: PlaybackState;
}

export function ProgressBar({ playback }: ProgressBarProps) {
  const { currentSegmentIndex, totalSegments, segmentProgress } = playback;

  // Overall progress: completed segments + current segment progress
  const overallProgress = totalSegments > 0
    ? ((currentSegmentIndex + segmentProgress) / totalSegments) * 100
    : 0;

  return (
    <div className="ir-progress-container">
      <div className="ir-progress-bar">
        <div
          className="ir-progress-fill"
          style={{ width: `${Math.min(100, overallProgress)}%` }}
        />
      </div>
      <span className="ir-segment-count">
        {currentSegmentIndex + 1}/{totalSegments}
      </span>
    </div>
  );
}
