import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteProvider, getActiveGroupConfigs, getActiveProvider, getProviders,
  getSettings, saveProvider, setActiveProviderGroup,
} from './storage';
import { DEFAULT_SETTINGS } from './constants';
import { getNextCandidate, markFailed, resetAllHealth } from '../background/failover';
import { ApiError } from './api-error';
import type { ProviderConfig } from './types';

let data: Record<string, unknown>;
const retired: ProviderConfig[] = ['groq', 'elevenlabs'].map((providerId) => ({
  id: providerId, providerId, name: providerId, apiKey: 'saved-key-to-retain',
}));
const mimo: ProviderConfig = { id: 'mimo', providerId: 'mimo', name: 'MiMo', apiKey: 'mimo-key', extraParams: { model: 'mimo-v2.5-tts' } };

beforeEach(() => {
  resetAllHealth();
  data = {
    'ir-providers': [...retired, mimo],
    'ir-settings': { ...DEFAULT_SETTINGS, activeProviderGroup: 'groq', activeVoiceId: 'autumn' },
  };
  vi.stubGlobal('chrome', {
    storage: { local: {
      get: vi.fn(async (key: string) => structuredClone({ [key]: data[key] })),
      set: vi.fn(async (values: Record<string, unknown>) => { Object.assign(data, structuredClone(values)); }),
    } },
  });
});

describe('retired provider configurations', () => {
  it.each(['groq', 'elevenlabs'])('clears the active %s selection without deleting keys or picking a replacement', async (providerId) => {
    data['ir-settings'] = { ...DEFAULT_SETTINGS, activeProviderGroup: providerId, activeVoiceId: 'old-voice' };
    expect(await getSettings()).toMatchObject({ activeProviderGroup: null, activeVoiceId: null });
    expect(await getActiveProvider()).toBeNull();
    expect(await getActiveGroupConfigs()).toEqual([]);
    expect(await getProviders()).toEqual([...retired, mimo]);
    expect(data['ir-settings']).toMatchObject({ activeProviderGroup: null, activeVoiceId: null });
  });

  it('handles the legacy config-ID setting without reactivating a retired adapter', async () => {
    data['ir-settings'] = { ...DEFAULT_SETTINGS, activeProviderId: 'groq', activeVoiceId: 'old-voice' };
    expect(await getSettings()).toMatchObject({ activeProviderGroup: null, activeVoiceId: null });
    expect(data['ir-settings']).not.toHaveProperty('activeProviderId');
  });

  it('rejects activation of retired and missing groups', async () => {
    await expect(setActiveProviderGroup('elevenlabs')).rejects.toThrow('supported provider');
    await expect(setActiveProviderGroup('missing')).rejects.toThrow('supported provider');
  });

  it('keeps supported playback groups available, including custom endpoints', async () => {
    const custom = { ...mimo, id: 'custom', providerId: 'custom', baseUrl: 'https://example.com/v1/' };
    await saveProvider(custom);
    for (const [group, config] of [['mimo', mimo], ['custom:https://example.com/v1', custom]] as const) {
      await setActiveProviderGroup(group, 'voice');
      expect(await getActiveProvider()).toEqual(config);
      expect(await getActiveGroupConfigs()).toEqual([config]);
    }
  });

  it('allows explicitly deleting a retired configuration while retaining other keys', async () => {
    await deleteProvider('groq');
    expect(await getProviders()).toEqual([retired[1], mimo]);
    await saveProvider({ ...mimo, name: 'Updated MiMo' });
    expect((await getProviders()).find((p) => p.id === 'elevenlabs')).toEqual(retired[1]);
  });
});

describe('maintained provider failover', () => {
  it('selects a healthy MiMo key and excludes a cooling-down key', async () => {
    const second = { ...mimo, id: 'mimo-second' };
    const third = { ...mimo, id: 'mimo-third' };
    await saveProvider(second);
    await saveProvider(third);
    markFailed(second.id, new ApiError('rate limit', 429, 'mimo', true));
    const session = { config: mimo, providerId: 'mimo', voice: { id: 'voice', name: 'Voice' }, generation: 1 };
    expect(await getNextCandidate(session, mimo.id)).toEqual(third);
  });

  it('never selects another retired account even for a stale session', async () => {
    await saveProvider({ ...retired[0], id: 'groq-second' });
    const session = { config: retired[0], providerId: 'groq', voice: { id: 'voice', name: 'Voice' }, generation: 1 };
    expect(await getNextCandidate(session, retired[0].id)).toBeNull();
  });
});


describe('MiMo configuration migration', () => {
  it.each([undefined, {}, { model: 'mimo-v2-tts', other: 'retain' }, { model: 'mimo-v2.5-tts' }])(
    'migrates saved official params %j before direct playback and editing', async (extraParams) => {
      data['ir-providers'] = [{ ...mimo, extraParams }];
      data['ir-settings'] = { ...DEFAULT_SETTINGS, activeProviderGroup: 'mimo', activeVoiceId: 'default_en' };
      const migrated = { ...mimo, extraParams: { ...extraParams, model: 'mimo-v2.5-tts' } };
      expect(await getActiveProvider()).toEqual(migrated);
      expect(await getProviders()).toEqual([migrated]);
      expect(data['ir-providers']).toEqual([migrated]);
      // Leave old voice selection intact so playback/UI can require reselection.
      expect((await getSettings()).activeVoiceId).toBe('default_en');
      const writes = vi.mocked(chrome.storage.local.set).mock.calls.length;
      await getProviders();
      expect(vi.mocked(chrome.storage.local.set).mock.calls.length).toBe(writes);
    },
  );

  it('normalizes official configurations on save without losing the key or other params', async () => {
    await saveProvider({ ...mimo, baseUrl: 'https://api.xiaomimimo.com/v1/', extraParams: { model: 'mimo-v2-tts', other: 1 } });
    expect(await getProviders()).toContainEqual({ ...mimo, baseUrl: 'https://api.xiaomimimo.com/v1/', extraParams: { model: 'mimo-v2.5-tts', other: 1 } });
  });

  it.each([undefined, 'mimo-v2-tts', 'service-specific-model'])(
    'preserves compatible endpoint model %s including its historical default', async (model) => {
      const custom = { ...mimo, baseUrl: 'https://compatible.example/v1', extraParams: model ? { model } : undefined };
      data['ir-providers'] = [custom];
      const expected = { ...custom, extraParams: { model: model ?? 'mimo-v2-tts' } };
      expect(await getProviders()).toEqual([expected]);
      await saveProvider(custom);
      expect(await getProviders()).toEqual([expected]);
    },
  );
});
