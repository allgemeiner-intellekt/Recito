import React, { useCallback, useRef } from 'react'

export function ProgressBar(props: { current: number; total: number; onSeek: (t: number) => void }): JSX.Element {
  const ref = useRef<HTMLDivElement | null>(null)

  const pct = props.total > 0 ? Math.max(0, Math.min(1, props.current / props.total)) : 0

  const onClick = useCallback(
    (e: React.MouseEvent) => {
      const el = ref.current
      if (!el || props.total <= 0) return
      const rect = el.getBoundingClientRect()
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
      const t = (x / rect.width) * props.total
      props.onSeek(t)
    },
    [props]
  )

  return (
    <div ref={ref} className="ir-progress" onClick={onClick} role="slider" aria-label="Progress">
      <div className="ir-progress-bar" style={{ width: `${pct * 100}%` }} />
    </div>
  )
}

