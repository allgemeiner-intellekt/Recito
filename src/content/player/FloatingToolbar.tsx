/* eslint-disable jsx-a11y/no-noninteractive-element-interactions -- The region delegates Escape and hover; native controls receive keyboard focus. */
import { PROVIDER_LIST } from '@providers/registry';
import React, { useEffect, useRef, useState } from 'react';
import { useToolbarStore } from '../state/store';
import { useShallow } from 'zustand/shallow';
import {
  usePreferences,
  useVoices,
  useHealth,
  readyKeyCount,
  sessionProvider,
} from '../../ui/usePreferences';
import { Icon } from '../../ui/Icon';
import { ErrorCard, SpeedControl, SpeedPresets } from '../../ui/controls';
import { getProviderSpeedRange, SPEED_PRESETS, formatSpeed } from '@shared/constants';
import { formatTime, readingTimes, progressFraction } from '@shared/playback-copy';
import { MSG, sendMessage } from '@shared/messages';
import { useDrag } from './useDrag';

export function FloatingToolbar() {
  const store = useToolbarStore(
    useShallow((s) => ({
      visible: s.toolbarVisible,
      expanded: s.expanded,
      toast: s.toastMessage,
      state: s.snapshot,
    })),
  );
  const actions = useToolbarStore.getState();
  const { settings, providers, active: defaultProvider, update } = usePreferences();
  const state = store.state;
  const active = sessionProvider(state, providers, defaultProvider);
  const group =
    state.status !== 'idle' && state.providerGroup
      ? state.providerGroup
      : settings.activeProviderGroup;
  const providerId =
    state.status !== 'idle'
      ? (state.providerId ?? active?.providerId ?? null)
      : (active?.providerId ?? null);
  const { voices } = useVoices(active);
  const { health } = useHealth();
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [tucked, setTucked] = useState(false);
  const [away, setAway] = useState(false);
  useEffect(() => {
    const listener = (e: Event) => setAway((e as CustomEvent<boolean>).detail);
    window.addEventListener('recito:reading-visibility', listener);
    return () => window.removeEventListener('recito:reading-visibility', listener);
  }, []);
  const [slow, setSlow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { style, onPointerDown } = useDrag(settings, update);
  const notice = store.toast ?? state.notice;
  useEffect(() => {
    if (
      !['playing', 'loading'].includes(state.status) ||
      store.expanded ||
      notice ||
      slow ||
      hover ||
      focus ||
      !settings.tuckWhilePlaying
    ) {
      setTucked(false);
      return;
    }
    if (tucked) return;
    const timer = setTimeout(() => setTucked(true), 2600);
    return () => clearTimeout(timer);
  }, [state.status, store.expanded, notice, slow, hover, focus, settings.tuckWhilePlaying, tucked]);
  useEffect(() => {
    setSlow(false);
    if (state.status !== 'loading') return;
    const timer = setTimeout(() => setSlow(true), 2500);
    return () => clearTimeout(timer);
  }, [state.status]);
  if (!store.visible) return null;
  const times = readingTimes(state);
  const range = getProviderSpeedRange(providerId);
  const primary = () =>
    state.status === 'error'
      ? sendMessage({ type: MSG.RETRY })
      : state.status === 'playing'
        ? actions.pause()
        : state.status === 'paused'
          ? actions.resume()
          : actions.play();
  // Escape and hover are delegated here; only the native controls receive keyboard focus.
  return (
    <div
      role="region"
      aria-label="Recito player"
      ref={ref}
      className="rp"
      data-layout="rail"
      data-side={settings.playerPosition === 'rail-left' ? 'left' : 'right'}
      data-status={state.status}
      data-tucked={
        tucked &&
        !slow &&
        !notice &&
        !store.expanded &&
        (state.status === 'playing' || state.status === 'loading')
      }
      style={style}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setFocus(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocus(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && store.expanded) {
          actions.setExpanded(false);
          e.stopPropagation();
          ref.current?.querySelector<HTMLButtonElement>('.rp-more')?.focus();
        }
      }}
    >
      <div
        className="rp-bar"
        role="toolbar"
        aria-label="Text-to-speech controls"
        aria-orientation="vertical"
        onPointerDown={onPointerDown}
      >
        <button
          className="rp-play"
          disabled={state.status === 'loading'}
          aria-label={
            state.status === 'loading'
              ? 'Preparing voice'
              : state.status === 'playing'
                ? 'Pause'
                : state.status === 'error'
                  ? 'Try again'
                  : 'Play'
          }
          style={{ '--p': progressFraction(state) } as React.CSSProperties}
          onClick={primary}
        >
          <i>
            <Icon name={state.status === 'playing' ? 'pause' : 'play'} />
          </i>
        </button>
        <span className="rp-time">{Math.max(1, Math.ceil(times.remaining / 60))} min</span>
        <div
          className="rp-extra"
          {...({ inert: tucked ? '' : undefined } as React.HTMLAttributes<HTMLDivElement>)}
        >
          <div>
            <button className="rp-btn" aria-label="Skip back" onClick={actions.skipBackward}>
              <Icon name="back" />
            </button>
            <button className="rp-btn" aria-label="Skip forward" onClick={actions.skipForward}>
              <Icon name="fwd" />
            </button>
            <div className="rp-sep" />
            <button
              className="rp-btn rp-speed"
              aria-label="Cycle reading speed"
              disabled={!range}
              title={!range ? 'Xiaomi MiMo does not support speed control' : 'Change speed'}
              onClick={() => {
                const presets = SPEED_PRESETS.filter((n) => n >= range!.min && n <= range!.max);
                actions.setSpeed(presets[(presets.indexOf(state.speed) + 1) % presets.length]);
              }}
            >
              {formatSpeed(state.speed)}
            </button>
            <button
              className="rp-btn rp-more"
              aria-label="Player settings"
              aria-expanded={store.expanded}
              onClick={actions.toggleExpanded}
            >
              <Icon name="chev" />
            </button>
            <button className="rp-btn" aria-label="Close player" onClick={actions.stop}>
              <Icon name="close" />
            </button>
          </div>
        </div>
      </div>
      {away && (state.status === 'playing' || state.status === 'paused') && (
        <button
          className="btn sm rp-return"
          style={{ position: 'fixed' }}
          onClick={() => {
            window.dispatchEvent(new Event('recito:return'));
          }}
        >
          Back to the sentence being read
        </button>
      )}
      <div className="rp-fly">
        {state.error && <ErrorCard player error={state.error} providerName={state.providerName} />}
        {!state.error && (notice || slow) && (
          <div className="rp-note rp-card" role="status">
            <Icon name="info" />
            <div>
              <b>{slow ? 'Preparing your voice' : notice}</b>
              {slow && <p>Your provider is taking a little longer. Your place is saved.</p>}
            </div>
          </div>
        )}
        {store.expanded && (
          <section className="rp-panel rp-card" aria-label="Player settings">
            <div className="rp-title">
              {state.scope?.kind === 'selection'
                ? 'Reading selected text'
                : 'Reading the whole page'}
            </div>
            <div className="rp-sub">
              {state.scope?.wordCount ?? 0} words · about {Math.max(1, Math.ceil(times.total / 60))}{' '}
              min
            </div>
            <input
              className="rp-seek"
              aria-label="Reading position"
              type="range"
              min="0"
              max={Math.max(0, state.totalChunks - 1)}
              value={state.currentChunkIndex}
              onChange={(e) => actions.seekToChunk(+e.target.value)}
            />
            <div className="rp-times">
              <span>{formatTime(times.elapsed)}</span>
              <span>−{formatTime(times.remaining)}</span>
            </div>
            <div className="rp-row">
              <span>Speed</span>
              <SpeedControl
                speed={state.speed}
                providerId={providerId}
                onChange={actions.setSpeed}
              />
            </div>
            <SpeedPresets speed={state.speed} providerId={providerId} onChange={actions.setSpeed} />
            <div className="rp-row">
              <label htmlFor="rail-voice">Voice</label>
              <select
                id="rail-voice"
                disabled={!active}
                className="sel"
                value={state.voiceId ?? settings.activeVoiceId ?? voices[0]?.id ?? ''}
                onChange={(e) => sendMessage({ type: MSG.SET_VOICE, voiceId: e.target.value })}
              >
                {voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="rp-row">
              <label htmlFor="rail-volume">Volume</label>
              <input
                id="rail-volume"
                type="range"
                min="0"
                max="1"
                step=".05"
                value={state.volume}
                onChange={(e) => actions.setVolume(+e.target.value)}
              />
            </div>
            <div className="rp-row">
              <label htmlFor="rail-follow">Follow along</label>
              <input
                id="rail-follow"
                className="sw"
                type="checkbox"
                checked={settings.followAlong}
                onChange={(e) => update({ followAlong: e.target.checked })}
              />
            </div>
            <div className="rp-foot">
              <span>
                {state.providerName ?? PROVIDER_LIST.find((p) => p.id === active?.providerId)?.name}{' '}
                · {readyKeyCount(providers, group, health)} keys ready
              </span>
              <button className="link" onClick={() => sendMessage({ type: MSG.OPEN_OPTIONS })}>
                Settings
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
