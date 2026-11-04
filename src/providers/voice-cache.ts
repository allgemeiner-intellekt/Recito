import type { ProviderConfig, Voice } from '@shared/types';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  voices: Voice[];
  cachedAt: number;
  signature: string;
}

const cache = new Map<string, CacheEntry>();

function signature(config: ProviderConfig): string {
  return JSON.stringify([config.providerId, config.baseUrl, config.extraParams]);
}

export function getCachedVoices(config: ProviderConfig): Voice[] | null {
  const entry = cache.get(config.id);
  if (!entry) return null;
  if (entry.signature !== signature(config) || Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(config.id);
    return null;
  }
  return entry.voices;
}

export function setCachedVoices(config: ProviderConfig, voices: Voice[]): void {
  cache.set(config.id, { voices, cachedAt: Date.now(), signature: signature(config) });
}

export function invalidateVoiceCache(configId?: string): void {
  if (configId) {
    cache.delete(configId);
  } else {
    cache.clear();
  }
}
