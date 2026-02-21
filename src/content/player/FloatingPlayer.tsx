import React, { useCallback } from 'react'

import { usePlayerStore } from '../state/player-store'
import { TimeDisplay } from './TimeDisplay'
import { ProgressBar } from './ProgressBar'
import { PlayerControls } from './PlayerControls'
import { SpeedSlider } from './SpeedSlider'
import { VoiceSelector } from './VoiceSelector'
import { setSettings } from '../../shared/storage'
import { BASE_UPM_CJK, BASE_UPM_SPACE } from '../../shared/constants'
import type { LangMode } from '../../shared/types'

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function upmToPlaybackRate(upm: number, langMode: LangMode): number {
  const base = langMode === 'space' ? BASE_UPM_SPACE : BASE_UPM_CJK
  return clamp(upm / base, 0.5, 3.0)
}

export function FloatingPlayer(): JSX.Element {
  const isVisible = usePlayerStore((s) => s.isVisible)
  const isMinimized = usePlayerStore((s) => s.isMinimized)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const isLoading = usePlayerStore((s) => s.isLoading)
  const error = usePlayerStore((s) => s.error)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const totalDuration = usePlayerStore((s) => s.totalDuration)
  const langMode = usePlayerStore((s) => s.langMode)
  const settings = usePlayerStore((s) => s.settings)

  const play = usePlayerStore((s) => s.play)
  const pause = usePlayerStore((s) => s.pause)
  const stop = usePlayerStore((s) => s.stop)
  const seekBy = usePlayerStore((s) => s.seekBy)
  const seekTo = usePlayerStore((s) => s.seekTo)
  const setRate = usePlayerStore((s) => s.setRate)
  const setMinimized = usePlayerStore((s) => s.setMinimized)

  const onPlayPause = useCallback(() => {
    if (isPlaying) void pause()
    else void play()
  }, [isPlaying, play, pause])

  const onSpeedChange = useCallback(
    async (upm: number) => {
      await setSettings({ rateUPM: upm })
      const nextRate = upmToPlaybackRate(upm, langMode)
      void setRate(nextRate)
      const cur = usePlayerStore.getState().settings
      if (cur) usePlayerStore.getState().setSettings({ ...cur, rateUPM: upm })
    },
    [langMode, setRate, settings]
  )

  const onVoiceChange = useCallback(
    async (voice: string) => {
      await setSettings({ selectedVoice: voice })
      const cur = usePlayerStore.getState().settings
      if (cur) usePlayerStore.getState().setSettings({ ...cur, selectedVoice: voice })
    },
    [settings]
  )

  if (!isVisible) return <div className="ir-hidden" />

  return (
    <div className="ir-player-wrap">
      <div className="ir-player" role="region" aria-label="Immersive Reader Player">
        <div className="ir-player-inner" style={{ display: isMinimized ? 'none' : 'grid' }}>
          <div className="ir-player-top">
            <TimeDisplay current={currentTime} total={totalDuration} />
            <button className="ir-btn" onClick={() => setMinimized(true)} aria-label="Minimize">
              Minimize
            </button>
          </div>

          <ProgressBar current={currentTime} total={totalDuration} onSeek={(t) => void seekTo(t)} />

          <PlayerControls
            isPlaying={isPlaying}
            isLoading={isLoading}
            onPlayPause={onPlayPause}
            onBack={() => void seekBy(-15)}
            onForward={() => void seekBy(15)}
            onStop={() => void stop()}
          />

          {settings ? (
            <div className="ir-row">
              <div style={{ flex: 1 }}>
                <SpeedSlider langMode={langMode} upm={settings.rateUPM} onChange={onSpeedChange} />
              </div>
            </div>
          ) : null}

          {settings ? <VoiceSelector value={settings.selectedVoice} onChange={onVoiceChange} /> : null}

          {error ? <div className="ir-error">{error}</div> : null}
        </div>

        {isMinimized ? (
          <div className="ir-player-inner" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="ir-btn ir-btn-primary" onClick={onPlayPause}>
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <TimeDisplay current={currentTime} total={totalDuration} />
            <button className="ir-btn" onClick={() => setMinimized(false)}>
              Expand
            </button>
            <button className="ir-btn" onClick={() => void stop()}>
              Stop
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
