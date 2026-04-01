# Plan 01: Provider Adapters & BYOK Storage Layer

**Estimated effort:** 3–4 days
**Depends on:** Plan 00 (scaffold)
**Unlocks:** Plan 03 (audio pipeline), Plan 05 (settings page)

## Objective

Implement the `TTSProvider` interface, three concrete adapters (OpenAI, ElevenLabs, Groq), a "custom OpenAI-compatible" adapter, and the secure key storage layer using `chrome.storage.local`. After this plan, you can programmatically validate a key, list voices, and synthesize audio from any supported provider.

## Tasks

### 1. Define core types (`/src/providers/types.ts`)

```typescript
interface ProviderConfig {
  id: string;
  providerId: string;       // 'openai' | 'elevenlabs' | 'groq' | 'custom'
  name: string;             // user-given label
  apiKey: string;
  baseUrl?: string;         // override for custom endpoints
  extraParams?: Record<string, unknown>;
}

interface Voice {
  id: string;
  name: string;
  language?: string;
  gender?: string;
  previewUrl?: string;
}

interface SynthesisResult {
  audioData: ArrayBuffer;   // raw audio bytes
  format: string;           // 'mp3', 'opus', 'wav', etc.
  wordTimings?: { word: string; startTime: number; endTime: number }[];
}

interface TTSProvider {
  id: string;
  name: string;
  listVoices(config: ProviderConfig): Promise<Voice[]>;
  synthesize(text: string, voice: Voice, config: ProviderConfig, options?: { speed?: number }): Promise<SynthesisResult>;
  validateKey(config: ProviderConfig): Promise<boolean>;
}
```

### 2. Implement provider adapters

- **OpenAI adapter** (`/src/providers/openai.ts`)
  - `synthesize`: POST `/v1/audio/speech` with `{ model: 'tts-1', input, voice, response_format: 'opus', speed }`
  - `listVoices`: return hardcoded list (alloy, echo, fable, onyx, nova, shimmer)
  - `validateKey`: call `listVoices` or a minimal synthesis request
  - Handle 401 (bad key) and 429 (rate limit) gracefully

- **ElevenLabs adapter** (`/src/providers/elevenlabs.ts`)
  - `synthesize`: POST `/v1/text-to-speech/{voice_id}/stream`
  - `listVoices`: GET `/v1/voices` — parse shared + user cloned voices
  - Support `voice_settings` (stability, similarity_boost) via `extraParams`

- **Groq adapter** (`/src/providers/groq.ts`)
  - Reuse OpenAI adapter logic with `baseUrl` defaulting to `https://api.groq.com/openai/v1`
  - Override voice list for Groq-specific voices (Fritz, Calum, Celeste, etc.)

- **Custom adapter** (`/src/providers/custom.ts`)
  - Pure OpenAI-compatible pass-through with user-defined `baseUrl`
  - `listVoices`: attempt GET `/v1/audio/voices`, fallback to empty list

### 3. Provider registry (`/src/providers/registry.ts`)

- Map of provider ID → adapter factory
- `getProvider(providerId: string): TTSProvider`
- Easy to extend: community adds a file + one registry entry

### 4. Storage layer (`/src/lib/storage.ts`)

- **Key storage**: CRUD operations for `ProviderConfig[]` in `chrome.storage.local`
  - `getProviders(): Promise<ProviderConfig[]>`
  - `saveProvider(config: ProviderConfig): Promise<void>`
  - `deleteProvider(configId: string): Promise<void>`
  - `getActiveProvider(): Promise<ProviderConfig | null>`
  - `setActiveProvider(configId: string): Promise<void>`
- **Key masking utility**: `maskKey(key: string) → '••••abcd'`
- Keys are NEVER placed in `chrome.storage.sync`

### 5. Message passing helpers (`/src/lib/messages.ts`)

- Typed message protocol between content script ↔ service worker ↔ popup
- Message types: `SYNTHESIZE`, `LIST_VOICES`, `VALIDATE_KEY`, `SET_ACTIVE_PROVIDER`, etc.
- Service worker acts as the central broker

### 6. Unit tests

- Mock `fetch` to test each adapter's request/response handling
- Test storage CRUD with a `chrome.storage.local` mock
- Test key masking utility

## Exit Criteria

- [ ] Each adapter can `validateKey` against a real API key (manual test)
- [ ] Each adapter returns a voice list (hardcoded or fetched)
- [ ] `synthesize()` returns valid `ArrayBuffer` audio data for a short string
- [ ] Storage CRUD works: add, list, update, delete provider configs
- [ ] Active provider selection persists across extension reload
- [ ] Keys are never written to `chrome.storage.sync`
- [ ] All unit tests pass

## Deliverables

- `TTSProvider` interface and three concrete adapters + custom adapter
- Provider registry with factory pattern
- Chrome storage abstraction layer for provider configs
- Typed message passing protocol
- Unit test suite for adapters and storage
