import type { TTSProvider, ProviderConfig, Voice, SynthesisResult, SynthesisOptions } from '@shared/types';
import { hasLikelyValidApiKeyFormat } from './api-key-format';
import { ApiError } from '@shared/api-error';
import { withTimeoutSignal } from '@shared/abort';
import { MIMO_BASE_URL, MIMO_MODEL, isOfficialMimoEndpoint, resolveMimoModel } from '@shared/mimo-config';

export const MIMO_MODELS = [
  { label: 'v2.5', modelId: MIMO_MODEL },
] as const;

const MIMO_VOICES: Voice[] = [
  { id: 'mimo_default', name: 'MiMo Default (depends on deployment cluster)' },
  { id: '冰糖', name: '冰糖 (Bingtang)', language: 'zh' },
  { id: '茉莉', name: '茉莉 (Moli)', language: 'zh' },
  { id: '苏打', name: '苏打 (Suda)', language: 'zh' },
  { id: '白桦', name: '白桦 (Baihua)', language: 'zh' },
  { id: 'Mia', name: 'Mia', language: 'en' },
  { id: 'Chloe', name: 'Chloe', language: 'en' },
  { id: 'Milo', name: 'Milo', language: 'en' },
  { id: 'Dean', name: 'Dean', language: 'en' },
];

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    'api-key': apiKey.trim(),
    'Content-Type': 'application/json',
  };
}

function voicesForConfig(config: ProviderConfig): Voice[] {
  if (isOfficialMimoEndpoint(config.baseUrl) && resolveMimoModel(config) !== MIMO_MODEL) {
    throw new ApiError('Select the supported MiMo v2.5 model in Settings > Providers.', 400, 'mimo', false);
  }
  return MIMO_VOICES;
}

function buildRequestBody(text: string, voiceId: string, model: string): Record<string, unknown> {
  return {
    model,
    modalities: ['text', 'audio'],
    audio: { voice: voiceId, format: 'mp3' },
    thinking: { type: 'disabled' },
    messages: [
      { role: 'user', content: 'Read the following text aloud.' },
      { role: 'assistant', content: text },
    ],
  };
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export const mimoProvider: TTSProvider = {
  id: 'mimo',
  name: 'Xiaomi Mimo',

  async listVoices(config: ProviderConfig): Promise<Voice[]> {
    return voicesForConfig(config);
  },

  async synthesize(
    text: string,
    voice: Voice,
    config: ProviderConfig,
    options?: SynthesisOptions,
  ): Promise<SynthesisResult> {
    const baseUrl = (config.baseUrl?.trim() || MIMO_BASE_URL).replace(/\/+$/, '');
    if (!voicesForConfig(config).some((candidate) => candidate.id === voice.id)) {
      throw new ApiError('This MiMo voice is no longer listed. Choose a voice in Settings > Voices before playing.', 400, 'mimo', false);
    }
    const body = buildRequestBody(text, voice.id, resolveMimoModel(config));

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/chat/completions`, {
        signal: withTimeoutSignal(options?.signal, 30_000),
        method: 'POST',
        headers: buildHeaders(config.apiKey),
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw ApiError.fromNetworkError(err, 'mimo');
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      if (response.status === 401) {
        throw new ApiError('Invalid API key. Please check your Mimo API key.', 401, 'mimo', false);
      }
      if (response.status === 429) {
        throw new ApiError('Rate limit exceeded. Please try again later.', 429, 'mimo', true);
      }
      throw ApiError.fromResponse(response.status, errBody || response.statusText, 'mimo', response.headers);
    }

    let json: Record<string, unknown>;
    try {
      json = await response.json();
    } catch {
      throw new ApiError('Failed to parse Mimo response as JSON.', 0, 'mimo', true);
    }

    // Extract base64 audio from choices[0].message.audio.data
    const choices = json.choices as Array<Record<string, unknown>> | undefined;
    const message = choices?.[0]?.message as Record<string, unknown> | undefined;
    const audio = message?.audio as Record<string, unknown> | undefined;
    const audioBase64 = audio?.data as string | undefined;

    if (!audioBase64) {
      throw new ApiError(
        'Mimo response missing audio data at choices[0].message.audio.data.',
        0,
        'mimo',
        true,
      );
    }

    const audioData = base64ToArrayBuffer(audioBase64);
    return { audioData, format: 'mp3' };
  },

  async validateKey(config: ProviderConfig): Promise<boolean> {
    if (!hasLikelyValidApiKeyFormat(config)) {
      return false;
    }

    const baseUrl = (config.baseUrl?.trim() || MIMO_BASE_URL).replace(/\/+$/, '');
    try {
      const body = buildRequestBody('test', voicesForConfig(config)[0]!.id, resolveMimoModel(config));
      const response = await fetch(`${baseUrl}/chat/completions`, {
        signal: AbortSignal.timeout(15_000),
        method: 'POST',
        headers: buildHeaders(config.apiKey),
        body: JSON.stringify(body),
      });
      return response.ok;
    } catch {
      return false;
    }
  },
};
