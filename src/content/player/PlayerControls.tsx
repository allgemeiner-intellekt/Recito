import React from 'react';

interface PlayerControlsProps {
  isPaused: boolean;
  onTogglePause: () => void;
  onSkipForward: () => void;
  onSkipBack: () => void;
  onStop: () => void;
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

const SkipBackIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M3 2V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M12 2.5L5 7L12 11.5V2.5Z" fill="currentColor" />
  </svg>
);

const SkipForwardIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M11 2V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M2 2.5L9 7L2 11.5V2.5Z" fill="currentColor" />
  </svg>
);

const StopIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="2" y="2" width="10" height="10" rx="1.5" fill="currentColor" />
  </svg>
);

export function PlayerControls({
  isPaused,
  onTogglePause,
  onSkipForward,
  onSkipBack,
  onStop,
}: PlayerControlsProps) {
  return (
    <>
      <button className="ir-btn" onClick={onSkipBack} aria-label="Previous segment">
        <SkipBackIcon />
      </button>
      <button className="ir-btn ir-btn-primary" onClick={onTogglePause} aria-label={isPaused ? 'Resume' : 'Pause'}>
        {isPaused ? <PlayIcon /> : <PauseIcon />}
      </button>
      <button className="ir-btn" onClick={onSkipForward} aria-label="Next segment">
        <SkipForwardIcon />
      </button>
      <button className="ir-btn ir-btn-stop" onClick={onStop} aria-label="Stop">
        <StopIcon />
      </button>
    </>
  );
}
