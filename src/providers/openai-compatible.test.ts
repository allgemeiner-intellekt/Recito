import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { customProvider } from './custom';
import {
  buildOpenAICompatibleUrl,
  validateOpenAICompatibleKey,
  validateOpenAICompatibleSpeech,
} from './openai-compatible';

describe('OpenAI-compatible provider helpers', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('appends /v1 only once when the base URL already includes it', () => {
    expect(buildOpenAICompatibleUrl('https://api.example.com/v1/', '/models')).toBe(
      'https://api.example.com/v1/models',
    );
  });

  it('adds /v1 when the base URL is provided without a version suffix', () => {
    expect(buildOpenAICompatibleUrl('https://api.example.com', '/audio/speech')).toBe(
      'https://api.example.com/v1/audio/speech',
    );
  });

  it('rejects non-audio 200 responses during speech validation', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>ok</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    await expect(
      validateOpenAICompatibleSpeech(
        'https://api.example.com/v1',
        {
          Authorization: 'Bearer test-key',
        },
        {
          model: 'tts-1',
          input: '.',
          voice: 'alloy',
          response_format: 'mp3',
        },
      ),
    ).resolves.toBe(false);
  });

  it('rejects unauthorized speech responses', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'Unauthorized' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(
      validateOpenAICompatibleKey('https://api.example.com/v1', {
        Authorization: 'Bearer test-key',
      }),
    ).resolves.toBe(false);
  });

  it('validates a custom provider without duplicating /v1', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ voices: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      }),
    );

    await expect(
      customProvider.validateKey({
        id: 'custom-1',
        providerId: 'custom',
        name: 'Custom',
        apiKey: 'test-key',
        baseUrl: 'https://api.example.com/v1',
      }),
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.example.com/v1/audio/voices',
      {
        headers: { Authorization: 'Bearer test-key' },
      },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.example.com/v1/audio/speech',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer test-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: 'test',
          voice: 'alloy',
          response_format: 'mp3',
        }),
      },
    );
  });
});
