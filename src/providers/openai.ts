import type { TTSProvider, ProviderConfig, Voice, SynthesisResult, SynthesisOptions } from '@shared/types';
import { buildOpenAICompatibleUrl, validateOpenAICompatibleKey } from './openai-compatible';
import { hasLikelyValidApiKeyFormat } from './api-key-format';
import { ApiError } from '@shared/api-error';
import { withTimeoutSignal } from '@shared/abort';
import { getRealtimeSession, mintClientSecret, pcm16ToWav } from './openai-realtime';

const DEFAULT_BASE_URL = 'https://api.openai.com';
const SYNTHESIS_TIMEOUT_MS = 30_000;

/** Voices offered by the Realtime API (`gpt-realtime-2.1-mini`). */
export const OPENAI_REALTIME_VOICES: Voice[] = [
  { id: 'marin', name: 'Marin' },
  { id: 'cedar', name: 'Cedar' },
  { id: 'alloy', name: 'Alloy' },
  { id: 'ash', name: 'Ash' },
  { id: 'ballad', name: 'Ballad' },
  { id: 'coral', name: 'Coral' },
  { id: 'echo', name: 'Echo' },
  { id: 'sage', name: 'Sage' },
  { id: 'shimmer', name: 'Shimmer' },
  { id: 'verse', name: 'Verse' },
];

/** Voices of the legacy `/audio/speech` path, kept for compatible third-party hosts. */
const LEGACY_SPEECH_VOICES: Voice[] = [
  { id: 'alloy', name: 'Alloy' },
  { id: 'echo', name: 'Echo' },
  { id: 'fable', name: 'Fable' },
  { id: 'onyx', name: 'Onyx' },
  { id: 'nova', name: 'Nova' },
  { id: 'shimmer', name: 'Shimmer' },
];

/** Legacy `tts-1` voices that the Realtime API does not offer, mapped to the closest one. */
const RETIRED_VOICE_REPLACEMENTS: Record<string, string> = {
  fable: 'ballad',
  onyx: 'ash',
  nova: 'coral',
};

/**
 * OpenAI configs normally talk to api.openai.com over the Realtime API. A config
 * whose base URL points elsewhere predates the migration and targets an
 * OpenAI-compatible speech server, so it keeps the `/audio/speech` request.
 */
export function usesLegacySpeechEndpoint(config: ProviderConfig): boolean {
  const baseUrl = config.baseUrl?.trim();
  if (!baseUrl) return false;
  try {
    return new URL(baseUrl).hostname !== 'api.openai.com';
  } catch {
    return false;
  }
}

export const openaiProvider: TTSProvider = {
  id: 'openai',
  name: 'OpenAI',

  async listVoices(config: ProviderConfig): Promise<Voice[]> {
    return usesLegacySpeechEndpoint(config) ? LEGACY_SPEECH_VOICES : OPENAI_REALTIME_VOICES;
  },

  resolveVoiceId(voiceId: string, config: ProviderConfig): string {
    if (usesLegacySpeechEndpoint(config)) return voiceId;
    return RETIRED_VOICE_REPLACEMENTS[voiceId] ?? voiceId;
  },

  async synthesize(
    text: string,
    voice: Voice,
    config: ProviderConfig,
    options?: SynthesisOptions,
  ): Promise<SynthesisResult> {
    if (usesLegacySpeechEndpoint(config)) return synthesizeLegacySpeech(text, voice, config, options);

    const session = getRealtimeSession({
      configId: config.id,
      apiKey: config.apiKey,
      voice: RETIRED_VOICE_REPLACEMENTS[voice.id] ?? voice.id,
      speed: options?.speed ?? 1.0,
    });
    const pcm = await session.speak(text, withTimeoutSignal(options?.signal, SYNTHESIS_TIMEOUT_MS));
    if (pcm.length === 0) {
      throw new ApiError('OpenAI returned no audio for this passage.', 0, 'openai', true);
    }
    return { audioData: pcm16ToWav(pcm), format: 'wav' };
  },

  async validateKey(config: ProviderConfig): Promise<boolean> {
    if (!hasLikelyValidApiKeyFormat(config)) {
      return false;
    }
    if (usesLegacySpeechEndpoint(config)) {
      return validateOpenAICompatibleKey(config.baseUrl!, {
        'Authorization': `Bearer ${config.apiKey}`,
      });
    }
    // Minting a client secret checks the key and Realtime access without generating audio.
    try {
      await mintClientSecret({ apiKey: config.apiKey, voice: 'marin', speed: 1.0 });
      return true;
    } catch {
      return false;
    }
  },
};

async function synthesizeLegacySpeech(
  text: string,
  voice: Voice,
  config: ProviderConfig,
  options?: SynthesisOptions,
): Promise<SynthesisResult> {
  const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  const speed = options?.speed ?? 1.0;
  const format = options?.format ?? 'mp3';

  let response: Response;
  try {
    response = await fetch(buildOpenAICompatibleUrl(baseUrl, '/audio/speech'), {
      signal: withTimeoutSignal(options?.signal, SYNTHESIS_TIMEOUT_MS),
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voice.id,
        response_format: format,
        speed,
      }),
    });
  } catch (err) {
    throw ApiError.fromNetworkError(err, 'openai');
  }

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    if (response.status === 401) {
      throw new ApiError('Invalid API key. Please check your OpenAI API key.', 401, 'openai', false);
    }
    if (response.status === 429) {
      throw new ApiError('Rate limit exceeded. Please try again later.', 429, 'openai', true);
    }
    throw ApiError.fromResponse(response.status, errBody || response.statusText, 'openai', response.headers);
  }

  const audioData = await response.arrayBuffer();
  return { audioData, format };
}
