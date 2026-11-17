import React from 'react';
import { getProviderSpeedRange, SPEED_PRESETS, formatSpeed } from '@shared/constants';
import { errorCopy } from '@shared/playback-copy';
import type { PlaybackError } from '@shared/types';
import { MSG, sendMessage } from '@shared/messages';
import { Icon } from './Icon';

export function SpeedControl({
  speed,
  providerId,
  onChange,
}: {
  speed: number;
  providerId: string | null;
  onChange: (n: number) => void;
}) {
  const range = getProviderSpeedRange(providerId);
  return (
    <span
      className="stepper"
      title={!range ? 'This provider does not support speed control' : 'Reading speed'}
    >
      <button
        aria-label="Decrease speed"
        disabled={!range || speed <= range.min}
        onClick={() => onChange(Math.max(range!.min, Math.round((speed - 0.25) * 100) / 100))}
      >
        −
      </button>
      <output aria-label="Reading speed">{formatSpeed(range ? speed : 1)}</output>
      <button
        aria-label="Increase speed"
        disabled={!range || speed >= range.max}
        onClick={() => onChange(Math.min(range!.max, Math.round((speed + 0.25) * 100) / 100))}
      >
        +
      </button>
    </span>
  );
}
export function SpeedPresets({
  speed,
  providerId,
  onChange,
}: {
  speed: number;
  providerId: string | null;
  onChange: (n: number) => void;
}) {
  const range = getProviderSpeedRange(providerId);
  return range ? (
    <div className="rp-presets">
      {SPEED_PRESETS.filter((n) => n >= range.min && n <= range.max).map((n) => (
        <button key={n} aria-pressed={speed === n} onClick={() => onChange(n)}>
          {formatSpeed(n)}
        </button>
      ))}
    </div>
  ) : (
    <div className="rp-hint">Xiaomi MiMo does not support speed control.</div>
  );
}
export function ErrorCard({
  error,
  providerName,
  player = false,
}: {
  error: PlaybackError;
  providerName?: string;
  player?: boolean;
}) {
  const copy = errorCopy(error, providerName);
  const setup = () => sendMessage({ type: MSG.OPEN_SETUP });
  return (
    <div className={player ? 'rp-note rp-card bad' : 'callout bad'} role="alert">
      <Icon name="alert" />
      <div>
        <b>{copy.title}</b>
        <p>{copy.body}</p>
        <div className="acts">
          {error.kind === 'auth' && (
            <button
              data-primary
              className="btn sm primary"
              onClick={() =>
                sendMessage({ type: MSG.OPEN_OPTIONS, configId: error.configIds?.[0] })
              }
            >
              Fix keys
            </button>
          )}
          <button
            data-primary={error.kind !== 'auth' || undefined}
            className={error.kind === 'auth' ? 'btn sm' : 'btn sm primary'}
            onClick={() =>
              error.kind === 'no-provider' ? setup() : sendMessage({ type: MSG.RETRY })
            }
          >
            {copy.action}
          </button>
          {error.kind === 'provider' && (
            <button
              className="btn sm"
              onClick={() =>
                sendMessage({ type: MSG.OPEN_OPTIONS, configId: error.configIds?.[0] })
              }
            >
              Fix keys
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
