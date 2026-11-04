import type { ProviderConfig } from './types';

export const MIMO_BASE_URL = 'https://api.xiaomimimo.com/v1';
export const MIMO_MODEL = 'mimo-v2.5-tts';
export const LEGACY_MIMO_MODEL = 'mimo-v2-tts';

export function isOfficialMimoEndpoint(baseUrl?: string): boolean {
  const value = baseUrl?.trim();
  if (!value) return true;
  try {
    const url = new URL(value);
    return (
      url.origin === 'https://api.xiaomimimo.com' &&
      url.pathname.replace(/\/+$/, '') === '/v1' &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function resolveMimoModel(config: Pick<ProviderConfig, 'baseUrl' | 'extraParams'>): string {
  const stored = config.extraParams?.model;
  const model = typeof stored === 'string' ? stored.trim() : '';
  if (isOfficialMimoEndpoint(config.baseUrl)) {
    return !model || model === LEGACY_MIMO_MODEL ? MIMO_MODEL : model;
  }
  // Preserve the historical default for compatible endpoints of unknown capability.
  return model || LEGACY_MIMO_MODEL;
}

export function normalizeMimoConfig(config: ProviderConfig): ProviderConfig {
  if (config.providerId !== 'mimo') return config;
  const model = resolveMimoModel(config);
  if (config.extraParams?.model === model) return config;
  return { ...config, extraParams: { ...config.extraParams, model } };
}
