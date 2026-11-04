import { isSupportedProvider } from '@shared/provider-support';
import type { TTSProvider } from '@shared/types';
import { openaiProvider } from './openai';
import { customProvider } from './custom';
import { mimoProvider } from './mimo';

export interface ProviderMeta {
  id: string;
  name: string;
  description: string;
  website: string;
}

const providerMap: Record<string, TTSProvider> = {
  openai: openaiProvider,
  mimo: mimoProvider,
  custom: customProvider,
};

export function getProvider(providerId: string): TTSProvider {
  const provider = providerMap[providerId];
  if (!isSupportedProvider(providerId) || !provider) {
    throw new Error(`Provider "${providerId}" is no longer supported. Select MiMo, OpenAI, or configure a compatible service as Custom in Settings.`);
  }
  return provider;
}

export interface ChunkLimits {
  minWords: number;
  maxWords: number;
  splitThreshold: number;
}

export function getChunkLimits(_providerId: string): ChunkLimits {
  // All maintained providers use sentence chunks with the same sizing.
  return { minWords: 30, maxWords: 50, splitThreshold: 80 };
}

export const PROVIDER_LIST: ProviderMeta[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'High-quality TTS with 6 built-in voices',
    website: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'mimo',
    name: 'Xiaomi Mimo',
    description: 'Built-in MiMo voices and synthesis',
    website: 'https://platform.xiaomimimo.com',
  },
  {
    id: 'custom',
    name: 'Custom (OpenAI-compatible)',
    description: 'Any OpenAI-compatible TTS endpoint',
    website: '',
  },
];
