import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elevenlabsProvider } from './elevenlabs';
import type { ProviderConfig, Voice } from '@shared/types';

const TEST_CONFIG: ProviderConfig = {
  id: 'elevenlabs-test',
  providerId: 'elevenlabs',
  name: 'ElevenLabs',
  apiKey: '  test-api-key  ',
};

const TEST_VOICE: Voice = {
  id: 'voice-123',
  name: 'Test Voice',
};

describe('elevenlabsProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('trims the API key before loading voices', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ voices: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await elevenlabsProvider.listVoices(TEST_CONFIG);

    expect(fetchMock).toHaveBeenCalledWith('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': 'test-api-key' },
    });
  });

  it('uses eleven_multilingual_v2 by default for synthesis', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    vi.stubGlobal('fetch', fetchMock);

    await elevenlabsProvider.synthesize('hello', TEST_VOICE, TEST_CONFIG);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      text: 'hello',
      model_id: 'eleven_multilingual_v2',
    });
  });

  it('surfaces ElevenLabs error details for 401 synthesis failures', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () =>
        JSON.stringify({
          detail: {
            status: 'invalid_api_key',
            message: 'A valid API key is required.',
          },
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      elevenlabsProvider.synthesize('hello', TEST_VOICE, TEST_CONFIG),
    ).rejects.toThrow('invalid_api_key: A valid API key is required.');
  });
});
