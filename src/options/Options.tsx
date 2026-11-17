import React, { useEffect, useRef, useState } from 'react';
import type { AppSettings, ProviderConfig } from '@shared/types';
import { isSupportedProvider } from '@shared/provider-support';
import { PROVIDER_LIST } from '@providers/registry';
import {
  deleteProvider,
  getProviderGroupKey,
  maskKey,
  saveSettings,
  getSettings,
} from '@shared/storage';
import { DEFAULT_SETTINGS } from '@shared/constants';
import { INKS, normalizeSettings } from '@shared/settings-model';
import { MSG, sendMessage } from '@shared/messages';
import { useTheme } from '@shared/useTheme';
import { usePreferences, useHealth, readyKeyCount } from '../ui/usePreferences';
import { VoiceGrid } from '../ui/VoiceGrid';
import { ProviderForm } from '../ui/ProviderForm';
import { Icon } from '../ui/Icon';
import { SpeedControl } from '../ui/controls';

const sections = [
  ['voice', 'Voice & keys', 'wave'],
  ['look', 'Appearance', 'lines'],
  ['play', 'Playback', 'circleplay'],
  ['keys', 'Shortcuts', 'kbd'],
  ['data', 'Data', 'data'],
] as const;
function Row({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="row">
      <div className="t">
        <b>{title}</b>
        {detail && <small>{detail}</small>}
      </div>
      <div className="ctl">{children}</div>
    </div>
  );
}
function Segment<T extends string>({
  label,
  values,
  value,
  onChange,
}: {
  label: string;
  values: readonly (readonly [T, string])[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {values.map(([id, title]) => (
        <button key={id} aria-pressed={value === id} onClick={() => onChange(id)}>
          {title}
        </button>
      ))}
    </div>
  );
}
export function Options() {
  useTheme();
  const { settings, providers, active, update, refresh, saved } = usePreferences();
  const { health, now } = useHealth();
  const [section, setSection] = useState('voice');
  const [editing, setEditing] = useState<ProviderConfig | null | undefined>();
  const [remove, setRemove] = useState<string | null>(null);
  const [reset, setReset] = useState(false);
  const [message, setMessage] = useState('');
  const [testing, setTesting] = useState<string>();
  const [flash, setFlash] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const key = new URLSearchParams(location.hash.slice(1)).get('key');
    if (key) {
      setSection('voice');
      setFlash(key);
      const timer = setTimeout(() => setFlash(''), 2500);
      return () => clearTimeout(timer);
    }
  }, []);
  useEffect(() => {
    if (editing !== undefined && !dialog.current?.open) dialog.current?.showModal();
  }, [editing]);
  const groups = new Map<string, ProviderConfig[]>();
  providers.forEach((p) => {
    const group = getProviderGroupKey(p);
    groups.set(group, [...(groups.get(group) ?? []), p]);
  });
  const supported = [...groups].filter(([, entries]) => isSupportedProvider(entries[0].providerId));
  const testKey = async (config: ProviderConfig) => {
    setTesting(config.id);
    try {
      const result = await sendMessage<{ ok: boolean; error?: string }>({
        type: MSG.TEST_KEY,
        config,
      });
      if (result?.ok) {
        await sendMessage({ type: MSG.RESET_PROVIDER_HEALTH, configId: config.id });
        setMessage(`${config.name}: Ready`);
      } else
        setMessage(
          `${config.name}: Refused. ${result?.error ?? 'Check the key, endpoint and account permissions.'}`,
        );
    } catch (e) {
      setMessage(String(e));
    } finally {
      setTesting(undefined);
    }
  };
  const exportData = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ version: 1, providers, settings }, null, 2)], {
        type: 'application/json',
      }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'recito-settings.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const importData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      try {
        if (!input.files?.[0]) return;
        const data = JSON.parse(await input.files[0].text());
        if (
          !data.settings ||
          !Array.isArray(data.providers) ||
          !data.providers.every(
            (p: ProviderConfig) =>
              typeof p.id === 'string' &&
              typeof p.providerId === 'string' &&
              typeof p.apiKey === 'string' &&
              typeof p.name === 'string',
          )
        )
          throw new Error('Invalid settings file.');
        await chrome.storage.local.set({ 'ir-providers': data.providers });
        await saveSettings(normalizeSettings(data.settings));
        await refresh();
        setMessage('Imported.');
      } catch (e) {
        setMessage(`Could not import: ${String(e)}`);
      }
    };
    input.click();
  };
  return (
    <div className="st">
      <nav className="st-nav" aria-label="Settings sections">
        <span className="wm">Recito</span>
        {sections.map(([id, title, icon]) => (
          <button
            key={id}
            aria-current={section === id ? 'page' : undefined}
            onClick={() => setSection(id)}
          >
            <Icon name={icon} size={18} />
            {title}
          </button>
        ))}
        <div className="saved" role="status">
          <Icon name="check" size={14} />
          <span>{saved}</span>
        </div>
      </nav>
      <main className="st-main">
        {message && (
          <div className="callout" role="status">
            {message}
            <button className="link" onClick={() => setMessage('')}>
              Dismiss
            </button>
          </div>
        )}
        {section === 'voice' && (
          <>
            <h1>Voice &amp; keys</h1>
            <p className="lede">
              Recito reads with your own provider account. Keys stay in this browser.
            </p>
            <h2>Reading voice</h2>
            <div className="card">
              <Row
                title="Provider in use"
                detail={
                  active
                    ? `${readyKeyCount(providers, settings.activeProviderGroup, health)} keys ready`
                    : 'Add a key to get started'
                }
              >
                <Segment
                  label="Provider in use"
                  value={settings.activeProviderGroup ?? ''}
                  values={supported.map(
                    ([key, entries]) =>
                      [
                        key,
                        PROVIDER_LIST.find((p) => p.id === entries[0].providerId)?.name ??
                          entries[0].name,
                      ] as const,
                  )}
                  onChange={(group) => update({ activeProviderGroup: group, activeVoiceId: null })}
                />
              </Row>
              <div className="sub">
                <VoiceGrid
                  config={active}
                  selected={settings.activeVoiceId}
                  onSelect={(voice) => update({ activeVoiceId: voice })}
                />
              </div>
            </div>
            <h2>Providers and keys</h2>
            {[...groups].map(([group, entries]) => {
              const retired = !isSupportedProvider(entries[0].providerId);
              return (
                <div className="card" key={group}>
                  <div className="grp-head">
                    <div>
                      <b>
                        {PROVIDER_LIST.find((p) => p.id === entries[0].providerId)?.name ??
                          entries[0].providerId}
                      </b>
                      <small>
                        {entries.length} {entries.length === 1 ? 'key' : 'keys'} · failover order
                      </small>
                    </div>
                    {settings.activeProviderGroup === group && <span className="tag">In use</span>}
                  </div>
                  {retired && (
                    <div className="row">
                      <p>
                        This provider is no longer supported. Your saved keys are kept so you can
                        remove or export them. Choose MiMo, OpenAI, or a custom compatible service.
                      </p>
                    </div>
                  )}
                  {entries.map((config, index) => {
                    const h = health[config.id];
                    const resting = h?.status === 'cooldown' && (h.cooldownUntil ?? 0) > now;
                    const failed = h?.status === 'failed';
                    return (
                      <div
                        className={`row key ${flash === config.id ? 'flash' : ''}`}
                        key={config.id}
                        id={`key-${config.id}`}
                      >
                        <div className="t">
                          <b>
                            {index + 1}. {config.name}
                          </b>
                          <span className="mask">{maskKey(config.apiKey)}</span>
                          {failed && (
                            <span className="why">
                              {h.lastError?.message ?? 'The provider refused this key.'}
                            </span>
                          )}
                        </div>
                        <div
                          className="ctl"
                          style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}
                        >
                          <span className={`status ${failed ? 'bad' : resting ? 'wait' : 'ok'}`}>
                            {retired
                              ? 'Retired'
                              : failed
                                ? 'Refused'
                                : resting
                                  ? `Resting · ${Math.ceil(((h.cooldownUntil ?? 0) - now) / 1000)}s`
                                  : 'Ready'}
                          </span>
                          {!retired && (
                            <>
                              {(failed || resting) && (
                                <button
                                  className="btn sm quiet"
                                  disabled={testing === config.id}
                                  onClick={() => testKey(config)}
                                >
                                  {testing === config.id ? 'Testing…' : 'Test again'}
                                </button>
                              )}
                              <button className="btn sm quiet" onClick={() => setEditing(config)}>
                                Edit
                              </button>
                            </>
                          )}
                          {remove === config.id ? (
                            <>
                              <span>Remove this key?</span>
                              <button
                                className="btn sm danger"
                                onClick={async () => {
                                  await deleteProvider(config.id);
                                  setRemove(null);
                                  await refresh();
                                }}
                              >
                                Confirm remove
                              </button>
                              <button className="btn sm" onClick={() => setRemove(null)}>
                                Keep
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn sm quiet danger"
                              onClick={() => setRemove(config.id)}
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <div className="form-actions">
              <button className="btn primary" onClick={() => setEditing(null)}>
                <Icon name="key" size={16} />
                Add a key
              </button>
              <span className="rp-hint">
                Add more than one key per provider and Recito switches to the next when one is
                rate-limited.
              </span>
            </div>
          </>
        )}
        {section === 'look' && (
          <>
            <h1>Appearance</h1>
            <p className="lede">How Recito looks, and how it marks the text it is reading.</p>
            <h2>Highlight</h2>
            <div className="card">
              <div
                className="preview"
                data-style={settings.highlightStyle}
                aria-label="Highlight preview"
              >
                Rhythm does part of the remembering for you.{' '}
                <span className="s">
                  A voice sets a <span className="w">pace</span>, and a pace is a kind of attention.
                </span>{' '}
                When a sentence is spoken you cannot slide past it.
              </div>
              <Row title="Style" detail="What marks the word being spoken">
                <Segment
                  label="Highlight style"
                  value={settings.highlightStyle}
                  values={[
                    ['marker', 'Marker'],
                    ['underline', 'Underline'],
                    ['sentence', 'Sentence only'],
                  ]}
                  onChange={(highlightStyle) => update({ highlightStyle })}
                />
              </Row>
              <Row title="Ink" detail="Also the accent colour across Recito">
                <div className="swatches" role="radiogroup" aria-label="Ink colour">
                  {Object.entries(INKS).map(([ink, color]) => (
                    <label key={ink} style={{ '--c': color } as React.CSSProperties}>
                      <input
                        type="radio"
                        name="ink"
                        aria-label={ink}
                        value={ink}
                        checked={settings.ink === ink}
                        onChange={() => update({ ink: ink as AppSettings['ink'] })}
                      />
                    </label>
                  ))}
                </div>
              </Row>
            </div>
            <h2>Theme</h2>
            <div className="card">
              <Row
                title="Recito's own surfaces"
                detail="Player, popup and settings. Web pages are never restyled."
              >
                <Segment
                  label="Theme"
                  value={settings.theme}
                  values={[
                    ['system', 'System'],
                    ['light', 'Light'],
                    ['dark', 'Dark'],
                  ]}
                  onChange={(theme) => update({ theme })}
                />
              </Row>
            </div>
          </>
        )}
        {section === 'play' && (
          <>
            <h1>Playback</h1>
            <p className="lede">Defaults for new reading sessions, and where the player sits.</p>
            <h2>Listening</h2>
            <div className="card">
              <Row title="Speed" detail="Applies to OpenAI and custom endpoints">
                <SpeedControl
                  speed={settings.playback.defaultSpeed}
                  providerId={active?.providerId ?? 'openai'}
                  onChange={(n) => update({ playback: { ...settings.playback, defaultSpeed: n } })}
                />
              </Row>
              <Row title="Volume">
                <input
                  aria-label="Default volume"
                  type="range"
                  min="0"
                  max="1"
                  step=".05"
                  value={settings.playback.defaultVolume}
                  onChange={(e) =>
                    update({ playback: { ...settings.playback, defaultVolume: +e.target.value } })
                  }
                />
              </Row>
              <Row
                title="Follow along"
                detail="Scroll to keep the spoken sentence in view. Pauses for 5 seconds when you scroll yourself."
              >
                <input
                  aria-label="Follow along"
                  className="sw"
                  type="checkbox"
                  checked={settings.followAlong}
                  onChange={(e) => update({ followAlong: e.target.checked })}
                />
              </Row>
              <Row title="Skip references" detail="Stop before bibliography and footnote sections">
                <input
                  aria-label="Skip references"
                  className="sw"
                  type="checkbox"
                  checked={settings.playback.skipReferences}
                  onChange={(e) =>
                    update({ playback: { ...settings.playback, skipReferences: e.target.checked } })
                  }
                />
              </Row>
            </div>
            <h2>Player</h2>
            <div className="card">
              <Row title="Position" detail="You can also drag the player on any page">
                <Segment
                  label="Player position"
                  value={settings.playerPosition}
                  values={[
                    ['rail-right', 'Right margin'],
                    ['rail-left', 'Left margin'],
                  ]}
                  onChange={(playerPosition) => update({ playerPosition })}
                />
              </Row>
              <Row
                title="Tuck away while playing"
                detail="Shrinks to the play button and time left until you point at it."
              >
                <input
                  className="sw"
                  aria-label="Tuck away while playing"
                  type="checkbox"
                  checked={settings.tuckWhilePlaying}
                  onChange={(e) => update({ tuckWhilePlaying: e.target.checked })}
                />
              </Row>
              <Row
                title="Clicking the toolbar icon"
                detail="The shortcut always starts reading directly"
              >
                <Segment
                  label="Toolbar icon click"
                  value={settings.iconClick}
                  values={[
                    ['popup', 'Opens the popup'],
                    ['read', 'Starts reading'],
                  ]}
                  onChange={(iconClick) => update({ iconClick })}
                />
              </Row>
            </div>
          </>
        )}
        {section === 'keys' && (
          <>
            <h1>Shortcuts</h1>
            <p className="lede">These work on any page, even when the player is tucked away.</p>
            <div className="card">
              {(
                [
                  ['Play or pause', 'Space'],
                  ['Skip forward', '→'],
                  ['Skip back', '←'],
                ] as const
              ).map(([label, key]) => (
                <Row key={key} title={label}>
                  <kbd>Alt</kbd>
                  <kbd>Shift</kbd>
                  <kbd>{key}</kbd>
                </Row>
              ))}
              <Row
                title="Jump to a passage"
                detail="While reading, click readable text on the page"
              >
                <kbd>Click</kbd>
              </Row>
            </div>
            <p>
              Chrome owns these bindings.{' '}
              <button
                className="link"
                onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
              >
                Change them in Chrome's shortcut settings
              </button>
            </p>
          </>
        )}
        {section === 'data' && (
          <>
            <h1>Data</h1>
            <p className="lede">Everything Recito stores lives in this browser profile.</p>
            <div className="card">
              <Row
                title="Export settings"
                detail="A JSON file with your preferences and provider keys. Treat it like a password."
              >
                <button className="btn" onClick={exportData}>
                  Export
                </button>
              </Row>
              <Row title="Import settings" detail="Replaces current preferences and keys">
                <button className="btn" onClick={importData}>
                  Import…
                </button>
              </Row>
              <Row title="Run setup again">
                <button
                  className="btn"
                  onClick={() =>
                    chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') })
                  }
                >
                  Open setup
                </button>
              </Row>
            </div>
            <h2>Reset</h2>
            <div className="card">
              <Row title="Reset preferences" detail="Keys and saved reading positions are kept">
                {reset ? (
                  <>
                    <button
                      className="btn danger"
                      onClick={async () => {
                        const current = await getSettings();
                        await update({
                          ...DEFAULT_SETTINGS,
                          activeProviderGroup: current.activeProviderGroup,
                          activeVoiceId: current.activeVoiceId,
                          onboardingComplete: current.onboardingComplete,
                        });
                        setReset(false);
                      }}
                    >
                      Confirm reset
                    </button>
                    <button className="btn" onClick={() => setReset(false)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button className="btn danger" onClick={() => setReset(true)}>
                    Reset…
                  </button>
                )}
              </Row>
            </div>
          </>
        )}
      </main>
      <dialog
        className="sheet"
        ref={dialog}
        aria-labelledby="key-sheet-title"
        onClose={() => setEditing(undefined)}
      >
        <div className="sheet-head">
          <h3 id="key-sheet-title">{editing ? 'Edit key' : 'Add a key'}</h3>
          <button className="icon-btn" aria-label="Close" onClick={() => dialog.current?.close()}>
            <Icon name="close" />
          </button>
        </div>
        <div className="sheet-body">
          {editing !== undefined && (
            <ProviderForm
              key={editing?.id ?? 'new'}
              existing={editing ?? undefined}
              onSaved={async () => {
                dialog.current?.close();
                setEditing(undefined);
                await refresh();
              }}
            />
          )}
        </div>
      </dialog>
    </div>
  );
}
