import React from 'react'

function fmt(t: number): string {
  if (!Number.isFinite(t) || t < 0) t = 0
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function TimeDisplay(props: { current: number; total: number }): JSX.Element {
  return (
    <span className="ir-pill">
      {fmt(props.current)} / {props.total > 0 ? fmt(props.total) : '--:--'}
    </span>
  )
}

