import React, { useEffect, useRef, useState } from 'react';
import type { ProviderConfig, Voice } from '@shared/types';
import { getProvider } from '@providers/registry';
import { useVoices } from './usePreferences';
import { Icon } from './Icon';

export const SAMPLE_TEXT =
  'A voice sets a pace, and a pace is a kind of attention. Listen to the words while your eyes follow the sentence. This is your reading voice.';
export function useVoiceSample() {
  const [playing, setPlaying] = useState(false);
  const [heard, setHeard] = useState(false);
  const [busy, setBusy] = useState(false);
  const [word, setWord] = useState(-1);
  const [error, setError] = useState('');
  const audio = useRef<HTMLAudioElement>();
  const url = useRef<string>();
  const request = useRef<AbortController>();
  const stop = () => {
    request.current?.abort();
    audio.current?.pause();
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = undefined;
    audio.current = undefined;
    setPlaying(false);
    setBusy(false);
    setWord(-1);
  };
  useEffect(
    () => () => {
      request.current?.abort();
      audio.current?.pause();
      if (url.current) URL.revokeObjectURL(url.current);
    },
    [],
  );
  const play = async (config: ProviderConfig, voice: Voice) => {
    stop();
    setError('');
    setBusy(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await getProvider(config.providerId).synthesize(SAMPLE_TEXT, voice, config, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      url.current = URL.createObjectURL(
        new Blob([result.audioData], { type: 'audio/' + result.format }),
      );
      const player = new Audio(url.current);
      audio.current = player;
      const words = SAMPLE_TEXT.match(/\S+/g) ?? [];
      const totalChars = words.reduce((n, w) => n + w.length, 0);
      player.ontimeupdate = () => {
        if (result.wordTimings?.length)
          setWord(
            result.wordTimings.findIndex(
              (t) => player.currentTime >= t.startTime && player.currentTime < t.endTime,
            ),
          );
        else {
          let target = (player.currentTime / player.duration) * totalChars;
          setWord(
            words.findIndex((w) => {
              target -= w.length;
              return target <= 0;
            }),
          );
        }
      };
      player.onended = stop;
      player.onerror = () => {
        stop();
        setError("Couldn't play the sample audio. Try again.");
      };
      await player.play();
      if (!controller.signal.aborted) {
        setPlaying(true);
        setHeard(true);
      }
    } catch (e) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  };
  return { play, stop, playing, busy, heard, word, error };
}
export function VoiceGrid({
  config,
  selected,
  onSelect,
}: {
  config: ProviderConfig | null;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const { voices, error, loading } = useVoices(config);
  const sample = useVoiceSample();
  const [sampleId, setSampleId] = useState('');
  return (
    <>
      {loading && <p role="status">Loading voices…</p>}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {config &&
        config.providerId === 'mimo' &&
        selected &&
        voices.length > 0 &&
        !voices.some((v) => v.id === selected) && (
          <p role="alert" className="callout wait">
            Your saved MiMo voice is no longer listed. Choose a voice before playing.
          </p>
        )}
      <div className="voices" role="radiogroup" aria-label="Reading voice">
        {voices.map((v) => (
          <label className="voice" key={v.id}>
            <input
              type="radio"
              name="reading-voice"
              checked={(selected ?? voices[0]?.id) === v.id}
              value={v.id}
              onChange={() => onSelect(v.id)}
            />
            <div className="t">
              <b>{v.name}</b>
              {v.language && <small>{v.language}</small>}
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label={
                sampleId === v.id && sample.playing
                  ? `Stop ${v.name} sample`
                  : `Hear ${v.name} sample`
              }
              disabled={sample.busy}
              onClick={(e) => {
                e.preventDefault();
                setSampleId(v.id);
                if (sample.playing && sampleId === v.id) sample.stop();
                else if (config) void sample.play(config, v);
              }}
            >
              <Icon name={sampleId === v.id && sample.playing ? 'pause' : 'play'} size={16} />
            </button>
          </label>
        ))}
      </div>
      {sample.error && (
        <p role="alert" className="error-text">
          {sample.error}
        </p>
      )}
    </>
  );
}
