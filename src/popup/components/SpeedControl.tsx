import React from 'react'

export function SpeedControl(props: { value: number; label: string; onChange: (v: number) => void }): JSX.Element {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div className="p-row">
        <div className="p-muted">
          {props.value} {props.label}
        </div>
      </div>
      <input
        className="p-range"
        type="range"
        min={100}
        max={900}
        step={10}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        aria-label="Speed"
      />
    </div>
  )
}

