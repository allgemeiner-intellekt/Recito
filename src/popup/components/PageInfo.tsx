import React from 'react'
import type { LangMode } from '../../shared/types'

export function PageInfo(props: {
  pageInfo: { wordCount: number; unitCount: number; langMode: LangMode } | null
}): JSX.Element {
  if (!props.pageInfo) return <div className="p-muted">Analyzing page…</div>

  const label = props.pageInfo.langMode === 'cjk' ? 'chars/segments' : 'words'
  const count = props.pageInfo.langMode === 'cjk' ? props.pageInfo.unitCount : props.pageInfo.wordCount

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div className="p-row">
        <div style={{ fontWeight: 600 }}>This page</div>
        <div className="p-muted">{props.pageInfo.langMode.toUpperCase()}</div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.3 }}>{count.toLocaleString()}</div>
      <div className="p-muted">{label} detected</div>
    </div>
  )
}

