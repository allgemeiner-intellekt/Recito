import React from 'react'
import type { LangMode } from '../../shared/types'

export function SpeedSlider(props: {
  langMode: LangMode
  upm: number
  onChange: (upm: number) => void
}): JSX.Element {
  const label = props.langMode === 'space' ? 'WPM' : 'CPM'
  return (
    <div className="ir-row">
      <span className="ir-pill">
        Speed: {props.upm} {label}
      </span>
      <input
        className="ir-range"
        type="range"
        min={100}
        max={900}
        step={10}
        value={props.upm}
        onChange={(e) => props.onChange(Number(e.target.value))}
        aria-label="Speed"
      />
    </div>
  )
}

