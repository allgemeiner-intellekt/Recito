# Read Aloud — Architecture Review

**Source:** https://github.com/ken107/read-aloud
**Version reviewed:** master branch, ~v2.22.0 (MV3)
**Stars:** ~1.6k | **License:** MIT
**Reviewed:** 2026-03-29

---

## Architecture Sketch

Read Aloud is structured around four distinct runtime contexts that communicate via `chrome.runtime.sendMessage` / `chrome.runtime.onMessage`:

```
[Service Worker: background.js]
       |  registerMessageListener("serviceWorker", handlers)
       |  events.js: playTab / stop / pause / resume / getPlaybackState
       v
[Player Page: player.html + player.js]     <-- pinned tab or embedded iframe
       |  registerMessageListener("player", handlers)
       |  owns Doc -> Speech -> TtsEngine chain
       |  owns audioPlayer (Audio element)
       v
[Offscreen Document: offscreen.html + offscreen.js]  (MV3 audio workaround)
       |  registerMessageListener("offscreen", handlers)
       |  plays <audio> in background context
       |
[Content Script: content.js]
       |  registerMessageListener("contentScript", handlers)
       |  getTexts(index) / getCurrentIndex() -> sent back to player
```

### Key structural decisions

**The "player" is not the service worker.** The service worker (`background.js`) is deliberately thin — it only handles IPC routing and content script injection. All stateful playback logic lives in a long-lived player page (either a pinned tab or an `<iframe>` injected into the content page). This is the primary MV3 keepalive strategy.

**TTS engine selection is done at Speech construction time** in `speech.js → pickEngine()`. The engine is chosen once per `Speech` object by inspecting `options.voice`:

```js
function pickEngine() {
  if (isPiperVoice(options.voice))       return piperTtsEngine;
  if (isSupertonicVoice(options.voice))  return supertonicTtsEngine;
  if (isAzure(options.voice))            return azureTtsEngine;
  if (isOpenai(options.voice))           return openaiTtsEngine;
  if (isUseMyPhone(options.voice))       return phoneTtsEngine;
  if (isGoogleTranslate(options.voice)
    && !/\s(Hebrew|Telugu)$/.test(...))  return googleTranslateTtsEngine;
  if (isAmazonPolly(options.voice))      return amazonPollyTtsEngine;
  if (isGoogleWavenet(options.voice))    return googleWavenetTtsEngine;
  if (isIbmWatson(options.voice))        return ibmWatsonTtsEngine;
  if (isPremiumVoice(...)
    || isReadAloudCloud(...))            return premiumTtsEngine;
  if (isGoogleNative(options.voice))     return new TimeoutTtsEngine(browserTtsEngine, 3000, 16000);
  return browserTtsEngine;
}
```

**The TtsEngine interface** (documented inline in `tts-engines.js`):

```js
interface TtsEngine {
  speak(text: string, opts: Options, playbackState$: Observable<"paused"|"resumed">): Observable<TtsEvent>
  getVoices(): Promise<Voice[]>
  // Optional:
  prefetch?(text: string, opts: Options): void
  forward?(): void
  rewind?(): void
  seek?(index: number): void
  stop?(): void   // legacy engines only
}

interface TtsEvent {
  type: "start" | "end" | "error" | "sentence" | "paragraph"
  charIndex?: number
  startIndex?: number   // for sentence events
  error?: Error
}

interface Voice {
  voiceName: string
  lang: string
  voiceId?: string   // for browser-native voices on macOS
}
```

Legacy engines (BrowserTtsEngine, GoogleTranslate, etc.) use a callback-based `speak(text, opts, onEvent)` signature; newer engines (OpenAI, Azure, Piper, Supertonic) use the RxJS `Observable` signature. The `makePlaybackLegacy()` wrapper in `speech.js` bridges the old API into the new reactive pipeline.

**Text chunking** happens in `Speech.getChunks()` before any engine is invoked:
- Google Native (browser TTS): `WordBreaker` — ~32–36 words per chunk, language-dependent
- Google Translate: `CharBreaker(200)` — 200 chars max
- Piper / Supertonic: full text as a single chunk (the engine handles segmentation internally)
- Everything else (OpenAI, Azure, Polly, Wavenet, IBM): `CharBreaker(750, ..., 200)` — 750 chars, with 200-char paragraph-combine threshold

**The reactive playback pipeline** in `speech.js` uses RxJS extensively:
- `cmd$` Subject drives forward/rewind/seek commands
- `playbackState$` BehaviorSubject holds `"paused"` | `"resumed"`
- `switchMap` on `cmd$` ensures that issuing a new navigation command immediately cancels and replaces the in-flight audio Observable — this is the engine-switch / hard-cut mechanism
- `prefetch` is called one chunk ahead when a `"start"` event arrives (look-ahead buffering)

**The `cache` object** in `tts-engines.js` is a simple 5-entry LRU that stores `blob:` URLs for synthesized audio. It uses `URL.createObjectURL` for fetch-based engines and `URL.revokeObjectURL` as the eviction destroyer.

---

## Reusable Patterns

### 1. TtsEngine interface with Observable return

The newer engines return `Observable<TtsEvent>` from `speak()`. This is the right contract for Immersive Reader — it naturally handles pause/resume via the `playbackState$` argument, composes with `switchMap` for engine switching, and propagates errors through the observable error channel rather than callbacks.

### 2. `switchMap` as the hard-cut engine-switch mechanism

When the user skips forward/backward or changes voice mid-session, `cmd$` emits a new command, `scan` produces a new `{playback$}` value, and `switchMap` unsubscribes from the old `playback$` Observable and immediately subscribes to the new one. There is no drain-buffer step — the old audio chunk is cut at the next chunk boundary (or immediately if the engine supports cancellation). This is intentional and produces acceptable behavior since chunks are short (200–750 chars).

### 3. `WordBreaker` / `CharBreaker` with `LatinPunctuator` / `EastAsianPunctuator`

These are well-tested text segmenters that handle abbreviations (Dr., Jan., etc.), em-dashes, East Asian punctuation, and paragraph combining. Immersive Reader should adopt the `CharBreaker(750, ..., 200)` pattern for cloud TTS engines and the word-based breaker only for browser native TTS.

### 4. `TimeoutTtsEngine` wrapper

Wraps any engine to add a `startTimeout` (fires if no `"start"` event within N ms, stops and retries once) and an `endTimeout` (fires if no `"end"` event, generates a synthetic `"end"`). This is a pragmatic workaround for Chrome's browser TTS being unreliable, but the wrapper pattern itself is reusable for any flaky network engine.

### 5. `makePending()` / `makeDispatcher()` RPC pattern

`messaging.js` contains a clean RPC-over-postMessage implementation:
- `type: "request"` carries `{id, method, args}`
- `type: "response"` carries `{id, result, error}`
- `type: "notification"` is fire-and-forget
- Pending requests are stored in a Map and resolved/rejected on response

This is exactly the pattern Immersive Reader needs for service-worker ↔ content-script ↔ player communication.

### 6. Prefetch look-ahead

When a `"start"` event fires for chunk N, the engine's optional `prefetch(chunk[N+1], options)` is called. Cloud engines (Polly, Wavenet, OpenAI) use this to pre-warm the HTTP request for the next audio blob before the current one finishes playing — reduces perceived gaps between chunks.

### 7. Offscreen document for audio playback

`player.js → playAudioOffscreen()` uses `chrome.offscreen.createDocument({reasons: ["AUDIO_PLAYBACK"]})` to play audio from a non-visible context. The offscreen document (`offscreen.js`) listens for `play/pause/resume` messages and fires `offscreenPlaybackEvent` back to the player. The player merges these events into the playback Observable using `rxjs.mergeWith`. This is the correct MV3 pattern when audio cannot be played in the service worker directly.

### 8. Silence track keepalive (Bluetooth gap fix)

`content.js` runs a `setInterval` every 5 seconds that calls `shouldPlaySilence()` on the player. If the player reports `PLAYING`, the content script plays a silent audio track. This works around a Bluetooth audio gap bug where silence between TTS chunks causes the audio stream to be considered ended. The `shouldPlaySilence()` method on the player uses a "provider ID" scheme to deduplicate calls from multiple content scripts and tracks expected check-in intervals to detect stale providers.

---

## Gotchas

### 1. No formal TTSProvider interface — dispatch is a flat if-chain

`pickEngine()` is an unguarded series of `if` checks on `options.voice` shape. There is no registry, no factory pattern, no capability flags. Adding a new engine means editing `pickEngine()`, `getChunks()`, and the various `isXxx()` predicate functions scattered across the codebase. For Immersive Reader, which is designed for BYOK, a proper engine registry (keyed by provider ID, with declared capabilities) will be essential.

### 2. Engine is locked at Speech construction, not hot-swappable

The `engine` variable in `Speech` is set once in the constructor. Changing the voice mid-playback (e.g., user switches API provider in settings) requires tearing down the current `Speech` object and creating a new one. There is no mid-session engine migration path.

### 3. Legacy vs. new API split is messy

Approximately half the engines use the old `speak(text, opts, onEvent)` callback API; the other half use the new Observable API. The `makePlaybackLegacy()` bridge adds complexity and subtle behavioral differences — notably, Google Native and ChromeOS voices `stop()` instead of `pause()` because their `pause()` is unreliable. This creates an implicit behavioral contract that is not expressed in the interface.

### 4. MV3 service worker keepalive is entirely passive

The service worker itself does nothing to stay alive. It relies on the player page (a pinned tab or iframe) to handle all stateful work. If the player tab is closed by the user, playback is silently abandoned — there is no reconnection or state recovery. The service worker has no alarm-based keepalive.

### 5. Error handling is minimal and inconsistent

- `BrowserTtsEngine`: errors from `brapi.tts` are forwarded verbatim; no retry.
- `WebSpeechEngine`: `"canceled"` and `"interrupted"` errors are swallowed silently.
- Premium/cloud engines: HTTP errors from `fetch()` are thrown as generic `Error` objects with the response body as the message. There is no structured handling for 401 (invalid API key), 429 (rate limit), or 503 (service unavailable) — these all surface as plain error strings to the UI.
- The `TimeoutTtsEngine` retries once on start-timeout, but no other engine has retry logic.
- Rate limit `Retry-After` headers from OpenAI / ElevenLabs / Azure are not read or respected.

### 6. API keys stored in `chrome.storage.sync` as plaintext

Credentials (`awsCreds.accessKeyId`, `gcpCreds.apiKey`, `ibmCreds.apiKey`, `azureCreds.key`) are stored directly in `chrome.storage.sync` and displayed with only trailing-character masking (`obfuscate()`). There is no encryption at rest. This is acceptable for a personal-use extension but should be documented as a known limitation in Immersive Reader.

### 7. `cache` is a module-level singleton with no persistence

The 5-entry LRU blob cache lives only in memory for the duration of the player page. When the player tab is closed and recreated, the cache is cold. For long reading sessions this causes redundant API calls at session start.

### 8. `getVoices()` on WebSpeech has a 1500ms timeout with silent failure

If `speechSynthesis.onvoiceschanged` never fires (common in headless or restricted contexts), `promiseTimeout(1500, ...)` resolves to `[]` with a `console.error`. No user-visible error is shown and the voice list silently appears empty.

### 9. Player auto-close timer can kill long sessions

The player page auto-closes after 5 minutes of idle time (15 minutes if Piper or Supertonic voices are installed). If the user pauses reading for more than 5 minutes, the player disappears and must be re-injected. Resume from the popup re-creates the player correctly, but any in-progress playback position is lost.

---

## Decision

**Adapt code — selective extraction.**

Do not take Read Aloud as a dependency; its architecture couples too many concerns and carries significant legacy weight (jQuery, cross-browser polyfills, the proprietary premium voice backend). However, the following components are worth adapting verbatim or near-verbatim into Immersive Reader:

| Component | Action |
|---|---|
| `WordBreaker` / `CharBreaker` + `LatinPunctuator` / `EastAsianPunctuator` | Copy and adapt — battle-tested segmentation logic |
| `makeDispatcher` / `RpcPeer` from `messaging.js` | Copy — clean, minimal RPC-over-postMessage |
| `TimeoutTtsEngine` wrapper pattern | Adapt — use for any browser-native TTS |
| `playAudioOffscreen()` + offscreen document pattern | Adapt — correct MV3 audio approach |
| Prefetch look-ahead pattern from `speech.js` | Adopt — low-complexity, meaningful latency reduction |
| Silence track keepalive from `content.js` | Adopt — needed for Bluetooth audio gap issue |
| Observable-based `TtsEngine` interface | Adopt as the canonical interface for all engines |

**Key improvements Immersive Reader must make over Read Aloud:**

1. Formal engine registry with capability flags (supports `pause`, supports `prefetch`, max chunk size, etc.)
2. Structured error taxonomy: `InvalidApiKey`, `RateLimited(retryAfter)`, `NetworkError`, `QuotaExceeded` — not raw strings
3. `Retry-After` header parsing and exponential backoff for 429 responses
4. Engine hot-swap without destroying `Speech` state (swap the engine reference, restart from current chunk index)
5. API keys stored with `chrome.storage.session` for in-memory-only storage, or at minimum with a documented warning
