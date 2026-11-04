import { describe, expect, it } from 'vitest';
import { hasLikelyValidApiKeyFormat } from './api-key-format';

describe('API key format guards', () => {
  it('rejects obviously invalid MiMo keys', () => {
    expect(
      hasLikelyValidApiKeyFormat({
        id: 'mimo-short',
        providerId: 'mimo',
        name: 'MiMo',
        apiKey: 'ab',
      }),
    ).toBe(false);
  });

  it('accepts likely valid MiMo keys', () => {
    expect(
      hasLikelyValidApiKeyFormat({
        id: 'mimo-valid',
        providerId: 'mimo',
        name: 'MiMo',
        apiKey: '1234567890abcdefghij',
      }),
    ).toBe(true);
  });

  it('rejects obviously invalid OpenAI keys', () => {
    expect(
      hasLikelyValidApiKeyFormat({
        id: 'openai-short',
        providerId: 'openai',
        name: 'OpenAI',
        apiKey: 'sk-1',
      }),
    ).toBe(false);
  });
});
