import React from 'react'

const VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']

export function VoiceSelector(props: { value: string; onChange: (v: string) => void }): JSX.Element {
  return (
    <select className="p-select" value={props.value} onChange={(e) => props.onChange(e.target.value)} aria-label="Voice">
      {VOICES.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  )
}

