import React, { useEffect, useMemo, useState } from 'react'

import type { TTSSettings } from '../shared/types'
import { getSettings, resetSettings, setSettings } from '../shared/storage'

const VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']

export function Options(): JSX.Element {
  const [settings, setLocal] = useState<TTSSettings | null>(null)
  const [savedAt, setSavedAt] = useState<number>(0)

  useEffect(() => {
    void (async () => {
      const s = await getSettings()
      setLocal(s)
    })()
  }, [])

  const onUpdate = async (partial: Partial<TTSSettings>) => {
    const next = await setSettings(partial)
    setLocal(next)
    setSavedAt(Date.now())
  }

  const status = useMemo(() => {
    if (!savedAt) return null
    const d = new Date(savedAt)
    return `Saved ${d.toLocaleTimeString()}`
  }, [savedAt])

  if (!settings) {
    return (
      <div className="o-wrap">
        <div className="o-title">Settings</div>
        <div className="o-sub">Loading…</div>
      </div>
    )
  }

  return (
    <div className="o-wrap">
      <div className="o-title">Immersive Reader Settings</div>
      <div className="o-sub">
        Configure an OpenAI-compatible TTS endpoint and your key. {status ? <span> · {status}</span> : null}
      </div>

      <div className="o-grid">
        <div className="o-card">
          <div className="o-row">
            <div>
              <div className="o-label">API Endpoint</div>
              <div className="o-help">Example: https://api.openai.com/v1</div>
            </div>
            <input
              className="o-input"
              value={settings.apiEndpoint}
              onChange={(e) => setLocal({ ...settings, apiEndpoint: e.target.value })}
              onBlur={(e) => void onUpdate({ apiEndpoint: e.target.value })}
              placeholder="https://…/v1"
            />
          </div>

          <div className="o-row">
            <div>
              <div className="o-label">API Key</div>
              <div className="o-help">Stored in chrome.storage.local; never injected into pages.</div>
            </div>
            <input
              className="o-input"
              type="password"
              value={settings.apiKey}
              onChange={(e) => setLocal({ ...settings, apiKey: e.target.value })}
              onBlur={(e) => void onUpdate({ apiKey: e.target.value })}
              placeholder="sk-…"
            />
          </div>
        </div>

        <div className="o-card">
          <div className="o-row">
            <div>
              <div className="o-label">TTS Model</div>
              <div className="o-help">Example: tts-1</div>
            </div>
            <input
              className="o-input"
              value={settings.ttsModel}
              onChange={(e) => setLocal({ ...settings, ttsModel: e.target.value })}
              onBlur={(e) => void onUpdate({ ttsModel: e.target.value })}
            />
          </div>

          <div className="o-row">
            <div>
              <div className="o-label">Voice</div>
              <div className="o-help">Used for new playback sessions.</div>
            </div>
            <select
              className="o-select"
              value={settings.selectedVoice}
              onChange={(e) => void onUpdate({ selectedVoice: e.target.value })}
            >
              {VOICES.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className="o-row">
            <div>
              <div className="o-label">Speed (UPM)</div>
              <div className="o-help">Words per minute (English) / chars per minute (CJK).</div>
            </div>
            <input
              className="o-input"
              type="number"
              min={100}
              max={900}
              step={10}
              value={settings.rateUPM}
              onChange={(e) => setLocal({ ...settings, rateUPM: Number(e.target.value) })}
              onBlur={(e) => void onUpdate({ rateUPM: Number(e.target.value) })}
            />
          </div>

          <div className="o-row">
            <div>
              <div className="o-label">Response Format</div>
              <div className="o-help">mp3 recommended.</div>
            </div>
            <input
              className="o-input"
              value={settings.responseFormat}
              onChange={(e) => setLocal({ ...settings, responseFormat: e.target.value })}
              onBlur={(e) => void onUpdate({ responseFormat: e.target.value })}
            />
          </div>
        </div>

        <div className="o-card">
          <div className="o-row">
            <div>
              <div className="o-label">Auto Scroll</div>
              <div className="o-help">Keep the active highlight near the middle of the viewport.</div>
            </div>
            <label className="o-toggle">
              <input
                type="checkbox"
                checked={settings.autoScroll}
                onChange={(e) => void onUpdate({ autoScroll: e.target.checked })}
              />
              <span className="o-help">{settings.autoScroll ? 'On' : 'Off'}</span>
            </label>
          </div>

          <div className="o-row">
            <div>
              <div className="o-label">Word Highlight</div>
              <div className="o-help">Highlight the current word/segment.</div>
            </div>
            <label className="o-toggle">
              <input
                type="checkbox"
                checked={settings.highlightWord}
                onChange={(e) => void onUpdate({ highlightWord: e.target.checked })}
              />
              <span className="o-help">{settings.highlightWord ? 'On' : 'Off'}</span>
            </label>
          </div>

          <div className="o-row">
            <div>
              <div className="o-label">Sentence Highlight</div>
              <div className="o-help">Lightly highlight the current sentence.</div>
            </div>
            <label className="o-toggle">
              <input
                type="checkbox"
                checked={settings.highlightSentence}
                onChange={(e) => void onUpdate({ highlightSentence: e.target.checked })}
              />
              <span className="o-help">{settings.highlightSentence ? 'On' : 'Off'}</span>
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 6 }}>
            <button
              className="o-btn"
              onClick={() => {
                void (async () => {
                  const next = await resetSettings()
                  setLocal(next)
                  setSavedAt(Date.now())
                })()
              }}
            >
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
