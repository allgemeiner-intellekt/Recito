import React from 'react';

interface PlayerControlsProps {
  onStop: () => void;
}

const StopIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
    <rect x="2" y="2" width="10" height="10" rx="1.5" fill="currentColor" />
  </svg>
);

export function PlayerControls({ onStop }: PlayerControlsProps) {
  return (
    <button className="ir-btn ir-btn-stop" onClick={onStop} aria-label="Stop">
      <StopIcon />
    </button>
  );
}
