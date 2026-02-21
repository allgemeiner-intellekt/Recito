import React from 'react'

export function SettingsLink(): JSX.Element {
  return (
    <button
      className="p-btn"
      onClick={() => chrome.runtime.openOptionsPage()}
      aria-label="Open Settings"
      style={{ padding: '8px 10px' }}
    >
      Settings
    </button>
  )
}

