import { afterEach, describe, expect, it, vi } from 'vitest';
import { mimoProvider } from './mimo';
import type { ProviderConfig } from '@shared/types';

const config: ProviderConfig = {
  id: 'mimo',
  providerId: 'mimo',
  name: 'MiMo',
  apiKey: 'test-key-at-least-16-chars',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('MiMo model and voice compatibility', () => {
  it.each([undefined, {}, { model: 'mimo-v2-tts' }, { model: 'mimo-v2.5-tts' }])(
    'sends the supported official model for saved params %j',
    async (extraParams) => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { audio: { data: 'AQID' } } }],
          }),
        ),
      );
      vi.stubGlobal('fetch', fetchMock);
      await mimoProvider.synthesize(
        'Hello',
        { id: 'Mia', name: 'Mia' },
        { ...config, extraParams },
      );
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('mimo-v2.5-tts');
    },
  );

  it('does not offer undocumented historical voice IDs on the official service', async () => {
    const voices = await mimoProvider.listVoices(config);
    expect(voices.map((voice) => voice.id)).toEqual([
      'mimo_default',
      '冰糖',
      '茉莉',
      '苏打',
      '白桦',
      'Mia',
      'Chloe',
      'Milo',
      'Dean',
    ]);
  });
});

describe('MiMo request safeguards', () => {
  it('validates a historical configuration using v2.5', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    expect(
      await mimoProvider.validateKey({ ...config, extraParams: { model: 'mimo-v2-tts' } }),
    ).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      model: 'mimo-v2.5-tts',
      audio: { voice: 'mimo_default' },
    });
  });

  it.each(['default_zh', 'default_en', 'missing'])(
    'rejects historical/unlisted voice %s before requesting audio',
    async (id) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      await expect(mimoProvider.synthesize('Text', { id, name: id }, config)).rejects.toThrow(
        'Choose a voice',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it('uses only the current voice catalog even for compatible endpoints with an old model', async () => {
    const custom = {
      ...config,
      baseUrl: 'https://compatible.example/v1',
      extraParams: { model: 'mimo-v2-tts' },
    };
    expect(await mimoProvider.listVoices(custom)).toEqual(await mimoProvider.listVoices(config));
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { audio: { data: 'AQID' } } }] })),
      );
    vi.stubGlobal('fetch', fetchMock);
    await mimoProvider.synthesize('Text', { id: 'Mia', name: 'Mia' }, custom);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('mimo-v2-tts');
  });
});
