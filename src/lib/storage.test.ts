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
const mimo: ProviderConfig = { id: 'mimo', providerId: 'mimo', name: 'MiMo', apiKey: 'mimo-key' };

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
