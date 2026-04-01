# Speechy — BYOK Review

## Architecture Sketch

Three-file architecture (MV3):
- `js/config.js` — error strings + `DEFAULT_OPTIONS` (the key storage schema)
- `js/background.js` — service worker: `TTSProvider` class hierarchy + `SpeechyService` orchestrator
- `js/play_audio.js` — content script: `SpeechyPlayer` class, MediaSource/blob URL playback

**Key flow:**
1. Background gets selected text via `chrome.scripting.executeScript`
2. Creates provider, calls `provider.synthesizeStream(text, options)` → returns `ReadableStream`
3. Reads stream chunks, sends each via `chrome.tabs.sendMessage({ action: "play_audio", audioData: [...], isLastChunk })`
4. Content script's `SpeechyPlayer.appendChunk()` feeds MediaSource (MP3) or accumulates WAV

## Reusable Patterns

**TTSProvider interface (adapt directly):**
```js
class TTSProvider {
  constructor(apiKey) { this.apiKey = apiKey; }
  async synthesize(text, options) { throw new Error("Not implemented"); }
  async synthesizeStream(text, options) { throw new Error("Not implemented"); }
}
```

**OpenAI adapter (straightforward, reuse):**
```js
// POST to https://api.openai.com/v1/audio/speech
// response_format: "mp3", returns response.body as ReadableStream
// Headers: Authorization: Bearer ${apiKey}
```

**Key storage pattern:**
```js
// chrome.storage.sync with defaults object
chrome.storage.sync.get(DEFAULT_OPTIONS, (items) => { ... });
// Keys: openai_apikey, google_apikey, api_provider, openai_voice, openai_model, openai_speed
// NO encryption — plaintext in sync storage
```

**MediaSource streaming for MP3 (from `play_audio.js`):**
```js
// 1. new MediaSource() + audio.src = URL.createObjectURL(mediaSource)
// 2. Wait for 'sourceopen' event
// 3. sourceBuffer = mediaSource.addSourceBuffer("audio/mpeg")
// 4. appendBuffer(chunk) → wait for 'updateend' → repeat
// 5. On last chunk: mediaSource.endOfStream()
```

**playbackId pattern** — unique ID per playback session (`${provider}-${voice}-${Date.now()}`). Content script checks this ID before applying chunks to prevent stale stream bleed.

## Gotchas

1. **WAV buffering anti-pattern**: Google TTS response is WAV — the player accumulates ALL chunks in memory (`pendingData = new Uint8Array(...)`) before creating a blob URL and playing. Zero streaming benefit. For OpenAI (MP3), streaming works correctly via MediaSource.

2. **No key validation**: `createTTSProvider()` only checks if key is truthy (non-empty string). No actual API validation until first synthesis attempt.

3. **Keys in sync storage are synced to Google servers** — for a truly private BYOK, prefer `chrome.storage.local`. Speechy uses `sync` which pushes keys to Google's Chrome Sync.

4. **MV3 service worker lifetime**: No keep-alive mechanism. Long audio streams could fail if the service worker suspends mid-stream. The entire stream is read in `handleReadText()` — if SW dies, playback dies.

5. **No stop/pause**: No mechanism to cancel in-flight playback or stop the stream reader.

6. **`Array.from(chunk)`** — converts `Uint8Array` to plain array for `chrome.tabs.sendMessage` (structured clone doesn't transfer TypedArrays in older Chrome). Adds overhead. Use `chunk.buffer` + transfer list instead.

## Decision

**Take inspiration only.** The BYOK key storage pattern and provider interface are worth adapting. The content-script MediaSource streaming approach is the right architecture. However:
- WAV buffering approach is incorrect — avoid
- No stop/pause/queue management — we need this
- Keys in sync storage: use `local` instead
- No sentence chunking — reads entire text as one TTS call
