# js-tts-wrapper — TTS Interface Evaluation

_v0.1.69 | https://github.com/willwade/js-tts-wrapper_

## Architecture Sketch

`AbstractTTSClient` base class with:
- Abstract: `_getVoices(): Promise<UnifiedVoice[]>`, `synthToBytes(text, options): Promise<Uint8Array>`
- Concrete: `getVoices()`, `speak()`, `speakStreamed()`, `pause()`, `resume()`, `stop()`
- `properties`: `{ volume: 100, rate: 'medium', pitch: 'medium' }`
- `capabilities`: `{ browserSupported, nodeSupported, needsWasm }` — per-engine capability flags
- `SSMLBuilder` instance exposed as `client.ssml`
- Event system via `callbacks` map (play, pause, end, word, error)

**Browser entry point** (`browser.ts`) exports only browser-safe engines:
Azure, ElevenLabs, Google, OpenAI, PlayHT, Polly, Watson, WitAI, SherpaOnnxWasm, EspeakBrowser, UpliftAI, ModelsLab

**Unified types:**
```ts
interface UnifiedVoice {
  id: string;
  name: string;
  gender?: "Male" | "Female" | "Unknown";
}

interface SpeakOptions {
  rate?: "x-slow" | "slow" | "medium" | "fast" | "x-fast";
  pitch?: "x-low" | "low" | "medium" | "high" | "x-high";
  volume?: number;       // 0-100
  voice?: string;
  format?: "mp3" | "wav" | "ogg" | "opus" | "aac" | "flac" | "pcm";
  useSpeechMarkdown?: boolean;
  useWordBoundary?: boolean;
  rawSSML?: boolean;
}
```

**Word boundary fallback estimator** (`utils/word-timing-estimator.ts`):
```ts
// Assumes 150 WPM baseline with per-word length factor
// lengthFactor = clamp(0.5, 2.0, word.length / 5)
// duration = msPerWord * lengthFactor
// Returns: Array<{ word, start, end }> in seconds
```

## Reusable Patterns

**`estimateWordBoundaries(text, { wordsPerMinute, startTime })`** — worth porting directly. Simple, practical fallback for providers without timestamp support. The length-factor heuristic is a reasonable proxy for pronunciation time.

**`capabilities` pattern** — expose `{ browserSupported, nodeSupported }` per engine. Lets the factory filter engines at runtime without hardcoding names.

**`SpeakOptions` type** — rate-as-string enum (`"x-slow"` | ... | `"x-fast"`) normalizes across providers that use float multipliers vs SSML rate values. Worth adopting in our own interface.

**`UnifiedVoice` schema** — simple, practical. Start from this shape for our voice list normalization.

## Gotchas

**Bundle size is the core problem.** Dependencies include:
- `sherpa-onnx-node` — native binding for local TTS (100+ MB)
- `lamejs` — MP3 encoder
- `buffer`, `js-untar`, `seek-bzip` — archive handling for WASM model downloads
- `speechmarkdown-js` — SSML/Markdown conversion
- `@elevenlabs/elevenlabs-js` — full ElevenLabs SDK

Even with `browser.ts` tree-shaking, the dep graph is too heavy for an extension. No published minified bundle size.

**No streaming abstraction in base class** — `synthToBytes()` returns full audio bytes. Streaming is per-engine, not in the abstract interface. Inconsistent.

**Pre-1.0 stability risk** — v0.1.69, breaking changes are likely.

**Browser compatibility:** SherpaOnnxWasm + EspeakBrowser require SharedArrayBuffer (needs cross-origin isolation headers — incompatible with most web pages in content scripts).

## Decision

**Take inspiration only — do not use as a direct dependency.**

The interface design (`AbstractTTSClient`, `UnifiedVoice`, `SpeakOptions`, `capabilities`) is well-designed. The `estimateWordBoundaries()` utility is worth porting directly (~40 lines).

Write our own `TTSProvider` interface modeled on this design. We only need OpenAI + ElevenLabs initially — rolling our own adapters is lower risk, smaller bundle, and avoids pre-1.0 churn.
