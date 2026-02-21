import React, { useEffect, useMemo, useState } from 'react'

import type { ExtensionMessage } from '../shared/messages'
import type { LangMode, TTSSettings } from '../shared/types'
import { runtimeSendMessage, tabsQuery } from '../shared/chrome-async'
import { getSettings, setSettings } from '../shared/storage'
import { PageInfo } from './components/PageInfo'
import { ListenButton } from './components/ListenButton'
import { SpeedControl } from './components/SpeedControl'
import { VoiceSelector } from './components/VoiceSelector'
import { SettingsLink } from './components/SettingsLink'

export function Popup(): JSX.Element {
  const [tabId, setTabId] = useState<number | null>(null)
  const [settings, setSettingsState] = useState<TTSSettings | null>(null)
  const [pageInfo, setPageInfo] = useState<{ wordCount: number; unitCount: number; langMode: LangMode } | null>(null)

  useEffect(() => {
    void (async () => {
      const [tab] = await tabsQuery({ active: true, currentWindow: true })
      setTabId(tab?.id ?? null)
    })()
  }, [])

  useEffect(() => {
    void (async () => {
      const s = await getSettings()
      setSettingsState(s)
    })()
  }, [])

  useEffect(() => {
    if (tabId == null) return
    void (async () => {
      const resp = (await runtimeSendMessage({
        type: 'GET_PAGE_INFO',
        payload: { tabId }
      } satisfies ExtensionMessage)) as ExtensionMessage

      if (resp?.type === 'PAGE_INFO_RESPONSE') setPageInfo(resp.payload)
    })()
  }, [tabId])

  const canListen = useMemo(() => !!tabId && !!settings?.apiEndpoint && !!settings?.apiKey, [tabId, settings])

  return (
    <div className="p-wrap">
      <div className="p-header">
        <div className="p-title">Immersive Reader</div>
        <div className="p-muted">Listen with AI TTS + live highlighting</div>
      </div>

      <div className="p-body">
        <div className="p-card">
          <PageInfo pageInfo={pageInfo} />
        </div>

        <div className="p-card" style={{ display: 'grid', gap: 10 }}>
          <div className="p-row">
            <div style={{ fontWeight: 600 }}>Voice</div>
          </div>
          {settings ? (
            <VoiceSelector
              value={settings.selectedVoice}
              onChange={async (v) => {
                const next = await setSettings({ selectedVoice: v })
                setSettingsState(next)
              }}
            />
          ) : (
            <div className="p-muted">Loading…</div>
          )}
        </div>

        <div className="p-card" style={{ display: 'grid', gap: 10 }}>
          <div className="p-row">
            <div style={{ fontWeight: 600 }}>Speed</div>
          </div>
          {settings ? (
            <SpeedControl
              value={settings.rateUPM}
              label={pageInfo?.langMode === 'cjk' ? 'CPM' : 'WPM'}
              onChange={async (v) => {
                const next = await setSettings({ rateUPM: v })
                setSettingsState(next)
              }}
            />
          ) : (
            <div className="p-muted">Loading…</div>
          )}
        </div>

        <div className="p-card">
          <ListenButton
            disabled={!canListen}
            onClick={async () => {
              if (!tabId) return
              await runtimeSendMessage({ type: 'START_PAGE_READING', payload: { tabId } } satisfies ExtensionMessage)
              window.close()
            }}
          />
          {!canListen ? (
            <div className="p-muted" style={{ marginTop: 8 }}>
              Tip: configure your API endpoint + key in Settings.
            </div>
          ) : null}
        </div>
      </div>

      <div className="p-footer">
        <SettingsLink />
        <div className="p-muted">v0.1.0</div>
      </div>
    </div>
  )
}
