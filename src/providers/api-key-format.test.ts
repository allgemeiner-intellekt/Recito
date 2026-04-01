import { describe, expect, it } from 'vitest';
import { hasLikelyValidApiKeyFormat } from './api-key-format';

describe('API key format guards', () => {
  it('rejects obviously invalid Groq keys', () => {
    expect(
      hasLikelyValidApiKeyFormat({
        id: 'groq-short',
        providerId: 'groq',
        name: 'Groq',
        apiKey: 'ab',
      }),
    ).toBe(false);
  });

  it('accepts likely valid Groq keys', () => {
    expect(
      hasLikelyValidApiKeyFormat({
        id: 'groq-valid',
        providerId: 'groq',
        name: 'Groq',
        apiKey: 'gsk_1234567890abcdefghij',
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
