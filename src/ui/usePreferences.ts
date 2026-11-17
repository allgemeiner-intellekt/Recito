import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS } from '@shared/constants';
import { getProviders, getSettings, saveSettings, getProviderGroupKey } from '@shared/storage';
import { normalizeSettings } from '@shared/settings-model';
import type { AppSettings, ProviderConfig, Voice } from '@shared/types';
import { MSG, sendMessage } from '@shared/messages';
import type { ConfigHealth } from '../background/failover';

export function usePreferences() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [saved, setSaved] = useState('Changes save as you make them');
  const refresh = useCallback(async () => {
    const [s, p] = await Promise.all([getSettings(), getProviders()]);
    setSettings(s);
    setProviders(p);
  }, []);
  useEffect(() => {
    void refresh();
    const handler = () => {
      void refresh();
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }, [refresh]);
  const update = async (partial: Partial<AppSettings>) => {
    const next = normalizeSettings({ ...settings, ...partial });
    setSettings(next);
    try {
      await saveSettings(next);
      setSaved('Saved');
    } catch {
      setSaved("Couldn't save. Try again.");
    }
  };
  const active =
    providers.find((p) => getProviderGroupKey(p) === settings.activeProviderGroup) ?? null;
  return { settings, providers, active, update, refresh, saved };
}
export function useVoices(config: ProviderConfig | null) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const signature = config ? JSON.stringify(config) : '';
  useEffect(() => {
    let live = true;
    setVoices([]);
    setError('');
    if (!config) return;
    setLoading(true);
    sendMessage<Voice[] | { error?: string }>({ type: MSG.LIST_VOICES, providerId: config.id })
      .then((result) => {
        if (!live) return;
        if (Array.isArray(result)) setVoices(result);
        else setError(result?.error ?? 'Could not load voices.');
      })
      .catch((e) => {
        if (live) setError(String(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
    // The full config signature invalidates voices when an endpoint or model is edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return { voices, error, loading };
}
export function useHealth() {
  const [health, setHealth] = useState<Record<string, ConfigHealth>>({});
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let live = true;
    const refresh = () =>
      sendMessage<Record<string, ConfigHealth>>({ type: MSG.GET_PROVIDER_HEALTH })
        .then((value) => {
          if (live) {
            setHealth(value ?? {});
            setNow(Date.now());
          }
        })
        .catch(() => {});
    void refresh();
    const timer = setInterval(refresh, 1000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  return { health, now };
}
export function readyKeyCount(
  providers: ProviderConfig[],
  group: string | null,
  health: Record<string, ConfigHealth>,
) {
  return providers.filter(
    (p) =>
      getProviderGroupKey(p) === group &&
      (!health[p.id] ||
        health[p.id].status === 'healthy' ||
        (health[p.id].status === 'cooldown' &&
          (health[p.id].cooldownUntil ?? Infinity) <= Date.now())),
  ).length;
}

/** Default-provider edits do not change an already bound playback session. */
export function sessionProvider(
  state: import('@shared/types').PlaybackState,
  providers: ProviderConfig[],
  fallback: ProviderConfig | null,
): ProviderConfig | null {
  if (state.status === 'idle' || !state.providerId) return fallback;
  return (
    providers.find(
      (p) =>
        p.id === state.configId &&
        p.providerId === state.providerId &&
        (!state.providerGroup || getProviderGroupKey(p) === state.providerGroup),
    ) ??
    providers.find((p) =>
      state.providerGroup
        ? getProviderGroupKey(p) === state.providerGroup
        : p.providerId === state.providerId,
    ) ??
    null
  );
}
