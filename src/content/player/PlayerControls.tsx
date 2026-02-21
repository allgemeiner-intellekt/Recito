import React from 'react'

export function PlayerControls(props: {
  isPlaying: boolean
  isLoading: boolean
  onPlayPause: () => void
  onBack: () => void
  onForward: () => void
  onStop: () => void
}): JSX.Element {
  return (
    <div className="ir-controls">
      <button className="ir-btn" onClick={props.onBack} aria-label="Back 15 seconds" disabled={props.isLoading}>
        -15s
      </button>
      <button
        className="ir-btn ir-btn-primary"
        onClick={props.onPlayPause}
        aria-label={props.isPlaying ? 'Pause' : 'Play'}
      >
        {props.isLoading ? 'Loading…' : props.isPlaying ? 'Pause' : 'Play'}
      </button>
      <button className="ir-btn" onClick={props.onForward} aria-label="Forward 15 seconds" disabled={props.isLoading}>
        +15s
      </button>
      <button className="ir-btn" onClick={props.onStop} aria-label="Stop">
        Stop
      </button>
    </div>
  )
}

