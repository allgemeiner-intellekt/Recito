import { describe, expect, it } from 'vitest';
import { isOfficialMimoEndpoint, normalizeMimoConfig, resolveMimoModel } from './mimo-config';

describe('MiMo endpoint migration boundary', () => {
  it.each([undefined, '', ' https://api.xiaomimimo.com/v1/ ', 'https://API.XIAOMIMIMO.COM:443/v1'])(
    'recognizes official endpoint %s',
    (baseUrl) => {
      expect(isOfficialMimoEndpoint(baseUrl)).toBe(true);
      expect(resolveMimoModel({ baseUrl })).toBe('mimo-v2.5-tts');
    },
  );

  it.each([
    'https://compatible.example/v1',
    'http://api.xiaomimimo.com/v1',
    'https://api.xiaomimimo.com/v2',
    'https://api.xiaomimimo.com.evil.example/v1',
    'https://api.xiaomimimo.com/v1?proxy=1',
    'https://user@api.xiaomimimo.com/v1',
    'invalid',
  ])('does not migrate unknown endpoint %s', (baseUrl) => {
    expect(isOfficialMimoEndpoint(baseUrl)).toBe(false);
    expect(resolveMimoModel({ baseUrl })).toBe('mimo-v2-tts');
    expect(resolveMimoModel({ baseUrl, extraParams: { model: 'service-model' } })).toBe(
      'service-model',
    );
  });

  it('does not change unrelated providers', () => {
    const config = {
      id: 'custom',
      providerId: 'custom',
      name: 'Custom',
      apiKey: 'test',
      extraParams: { model: 'mimo-v2-tts' },
    };
    expect(normalizeMimoConfig(config)).toBe(config);
  });
});
