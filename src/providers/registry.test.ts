import { describe, expect, it } from 'vitest';
import { getProvider, PROVIDER_LIST } from './registry';
import { isSupportedProvider } from '@shared/provider-support';

describe('maintained provider registry', () => {
  it('offers only MiMo, OpenAI and Custom, each with a working adapter', () => {
    expect(PROVIDER_LIST.map((p) => p.id).sort()).toEqual(['custom', 'mimo', 'openai']);
    for (const { id } of PROVIDER_LIST) {
      expect(isSupportedProvider(id)).toBe(true);
      expect(getProvider(id).id).toBe(id);
    }
  });

  it.each(['groq', 'elevenlabs', 'unknown'])('rejects stale %s configs with recovery guidance', (id) => {
    expect(isSupportedProvider(id)).toBe(false);
    expect(() => getProvider(id)).toThrow('Custom in Settings');
  });
});
