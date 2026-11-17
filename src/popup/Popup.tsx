import { PROVIDER_LIST } from '@providers/registry';
import React, { useEffect, useRef, useState } from 'react';
import { MSG, sendMessage } from '@shared/messages';
import type { PageInfo, PlaybackState } from '@shared/types';
import { useTheme } from '@shared/useTheme';
import { usePreferences, useVoices, useHealth, readyKeyCount } from '../ui/usePreferences';
import { Icon } from '../ui/Icon';
import { ErrorCard, SpeedControl } from '../ui/controls';
import { formatTime, minutesLeft, readingTimes, progressFraction } from '@shared/playback-copy';

const initial: PlaybackState = {
  status: 'idle',
  currentChunkIndex: 0,
  totalChunks: 0,
  chunkProgress: 0,
  currentTime: 0,
  duration: 0,
  speed: 1,
  volume: 1,
};

export function Popup() {
  useTheme();
  const prefs = usePreferences();
  const { settings, active, providers, update } = prefs;
  const { voices } = useVoices(active);
  const { health } = useHealth();
  const [state, setState] = useState(initial);
  const [info, setInfo] = useState<(PageInfo & { readable?: boolean }) | null>(null);
  const [tabId, setTabId] = useState<number>();
  const [elsewhereTitle, setElsewhereTitle] = useState('');
  const [loaded, setLoaded] = useState(false);
  const main = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const port = chrome.runtime.connect({ name: 'recito-popup' });
    const listener = (message: { state?: PlaybackState }) => {
      if (message.state) setState(message.state);
    };
    port.onMessage.addListener(listener);
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      setTabId(tab?.id);
      try {
        const page = await sendMessage<PageInfo & { error?: string; readable?: boolean }>({
          type: MSG.GET_PAGE_INFO,
        });
        if (!page?.error) setInfo(page);
      } finally {
        setLoaded(true);
      }
    })().catch(() => setLoaded(true));
    return () => {
      port.onMessage.removeListener(listener);
      port.disconnect();
    };
  }, []);
  const elsewhere = state.status !== 'idle' && state.tabId !== undefined && state.tabId !== tabId;
  useEffect(() => {
    if (elsewhere && state.tabId !== undefined)
      chrome.tabs
        .get(state.tabId)
        .then((t) => setElsewhereTitle(t.title ?? 'Another tab'))
        .catch(() => setElsewhereTitle('Another tab'));
  }, [elsewhere, state.tabId]);
  useEffect(() => {
    if (loaded) main.current?.querySelector<HTMLButtonElement>('[data-primary]')?.focus();
  }, [loaded, active?.id]);
  const playingHere = !elsewhere && state.status !== 'idle';
  const scope = playingHere ? state.scope : info?.scope;
  const selected = scope?.kind === 'selection';
  const wordCount = scope?.wordCount ?? info?.wordCount ?? 0;
  const times = readingTimes(
    playingHere
      ? state
      : {
          ...initial,
          currentChunkIndex: info?.savedChunk ?? 0,
          totalChunks: info?.savedTotal ?? 0,
          scope,
          speed: settings.playback.defaultSpeed,
        },
  );
  const start = (fromSelection = true, startChunk?: number) => {
    void sendMessage({ type: MSG.PLAY, fromSelection, startChunk });
  };
  const setup = () =>
    chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') });
  const readable = info && info.readable !== false && info.wordCount > 0;
  const speed = playingHere ? state.speed : settings.playback.defaultSpeed;
  return (
    <div className="pp">
      <header className="pp-head">
        <span className="wm">Recito</span>
        <button
          className="icon-btn"
          aria-label="Settings"
          onClick={() => sendMessage({ type: MSG.OPEN_OPTIONS })}
        >
          <Icon name="sliders" />
        </button>
      </header>
      {readable && (
        <div className="pp-page">
          <div className="pp-scope">
            <span className="pp-chip">{selected ? 'Selected text' : 'Whole page'}</span>
            <span className="pp-meta">
              {wordCount.toLocaleString()} words · ~{Math.max(1, Math.ceil(times.total / 60))} min
            </span>
          </div>
          <p className="pp-excerpt">
            {playingHere ? (state.excerpt ?? info.excerpt) : info.excerpt}
          </p>
          {playingHere && (
            <>
              <div
                className="bar"
                style={{ '--p': progressFraction(state) } as React.CSSProperties}
              />
              <div className="pp-times">
                <span>{formatTime(times.elapsed)}</span>
                <span>−{formatTime(times.remaining)}</span>
              </div>
            </>
          )}
        </div>
      )}
      <div ref={main} className="pp-main">
        {!loaded ? (
          <button className="btn lg block" disabled>
            Finding readable text…
          </button>
        ) : !elsewhere && state.status === 'error' && state.error ? (
          <ErrorCard error={state.error} providerName={state.providerName} />
        ) : !active ? (
          <div className="pp-empty">
            <h3>A voice for your reading</h3>
            <p>Connect your own provider to start listening.</p>
            <button data-primary className="btn primary block lg" onClick={setup}>
              Set up Recito
            </button>
          </div>
        ) : elsewhere ? (
          <div className="pp-empty">
            <h3>Reading in another tab</h3>
            <p>{elsewhereTitle}</p>
            <button
              data-primary
              className="btn primary block"
              onClick={() =>
                chrome.tabs.update(state.tabId!, { active: true }).then(async (tab) => {
                  if (tab.windowId !== undefined)
                    await chrome.windows.update(tab.windowId, { focused: true });
                  window.close();
                })
              }
            >
              Go to that tab
            </button>
            {readable && (
              <p className="pp-sub">
                <button className="link" onClick={() => start()}>
                  Read this page instead
                </button>
              </p>
            )}
          </div>
        ) : !readable ? (
          <div className="pp-empty">
            <h3>This page can't be read</h3>
            <p>
              Chrome doesn't let extensions read some pages. Try an article, email, or a selected
              passage.
            </p>
            <button data-primary className="btn" onClick={() => window.close()}>
              Got it
            </button>
          </div>
        ) : state.status === 'loading' ? (
          <button data-primary className="btn primary lg block" disabled>
            <span className="spin" />
            Preparing your voice…
          </button>
        ) : state.status === 'playing' || state.status === 'paused' ? (
          <div className="pp-transport">
            <button
              className="icon-btn pp-side"
              aria-label="Skip back"
              onClick={() => sendMessage({ type: MSG.SKIP_BACKWARD })}
            >
              <Icon name="back" />
            </button>
            <button
              data-primary
              className="pp-big"
              aria-label={state.status === 'playing' ? 'Pause' : 'Resume'}
              onClick={() =>
                sendMessage({ type: state.status === 'playing' ? MSG.PAUSE : MSG.RESUME })
              }
            >
              <Icon name={state.status === 'playing' ? 'pause' : 'play'} size={24} />
            </button>
            <button
              className="icon-btn pp-side"
              aria-label="Skip forward"
              onClick={() => sendMessage({ type: MSG.SKIP_FORWARD })}
            >
              <Icon name="fwd" />
            </button>
          </div>
        ) : (
          <>
            <button
              data-primary
              className="btn primary lg block"
              onClick={() => start(true, info?.savedChunk)}
            >
              <Icon name="play" />
              {info?.savedChunk
                ? `Resume · ${minutesLeft(times.remaining)}`
                : selected
                  ? 'Listen to selection'
                  : 'Listen'}
            </button>
            {selected && (
              <p className="pp-sub">
                <button className="link" onClick={() => start(false, 0)}>
                  Read the whole page instead
                </button>
              </p>
            )}
            {!!info?.savedChunk && (
              <p className="pp-sub">
                <button className="link" onClick={() => start(true, 0)}>
                  Start from the top
                </button>
              </p>
            )}
          </>
        )}
      </div>
      {state.notice && !elsewhere && (
        <div className="callout" role="status">
          {state.notice}
        </div>
      )}
      {readable && active && (
        <div className="pp-rows">
          <div className="pp-row">
            <label htmlFor="popup-voice">Voice</label>
            <select
              className="sel"
              id="popup-voice"
              value={state.voiceId ?? settings.activeVoiceId ?? voices[0]?.id ?? ''}
              onChange={(e) =>
                playingHere
                  ? sendMessage({ type: MSG.SET_VOICE, voiceId: e.target.value })
                  : update({ activeVoiceId: e.target.value })
              }
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
          <div className="pp-row">
            <span>Speed</span>
            <SpeedControl
              speed={speed}
              providerId={active.providerId}
              onChange={(n) =>
                playingHere
                  ? void sendMessage({ type: MSG.SET_SPEED, speed: n })
                  : void update({ playback: { ...settings.playback, defaultSpeed: n } })
              }
            />
          </div>
          {active.providerId === 'mimo' && (
            <div className="rp-hint">Xiaomi MiMo does not support speed control.</div>
          )}
        </div>
      )}
      <footer className="pp-foot">
        <span>
          {active
            ? `${state.providerName ?? PROVIDER_LIST.find((p) => p.id === active.providerId)?.name ?? active.providerId} · ${readyKeyCount(providers, settings.activeProviderGroup, health)} keys ready`
            : 'Your keys stay in this browser'}
        </span>
        <span>Alt Shift Space</span>
      </footer>
    </div>
  );
}
