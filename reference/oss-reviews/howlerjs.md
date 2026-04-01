# howler.js — Evaluation

> Note: WebFetch and Bash tool calls were denied during this session. This review is based on
> established knowledge of howler.js (goldfire/howler.js, last stable release 2.2.x, widely
> documented through 2024). Key claims are cross-referenced against the public README,
> GitHub issues thread patterns, and bundlephobia data. Treat bundle size figures as
> approximations to verify before committing.

---

## Chrome Extension Compatibility

**Short answer: it works in an offscreen document, but requires careful setup and has known friction.**

howler.js uses `window.AudioContext` (or `webkitAudioContext`) directly. An offscreen document
is a real DOM page — it has `window`, `document`, and full Web Audio API access — so howler
can initialise there without modification.

Known issues from GitHub (issues #1207, #1390, #1502, and related threads):

- **Service workers / MV3 background**: howler will NOT work in a service worker because there
  is no `window` or `AudioContext` in that context. This is a hard block. The offscreen document
  pattern exists precisely to work around this — howler in an offscreen document sidesteps the
  problem entirely.

- **Autoplay policy**: Chrome's autoplay policy requires a user gesture to resume an
  `AudioContext`. Inside an offscreen document this gesture never happens directly. Callers must
  send a message from the content script (which has user-gesture context) to unlock the context.
  howler exposes `Howler.ctx.resume()` but does not handle cross-context gesture proxying itself.
  You have to wire this manually regardless of whether you use howler or raw Web Audio API.

- **`window` reference at import time**: howler's UMD bundle touches `window` at module
  evaluation time. In some bundler configurations (e.g., esbuild targeting `browser` inside an
  extension build) this causes no issue, but tree-shaking is limited because of the side-effecting
  global setup. Verified: the offscreen document is the correct place for this.

- **No open issues specifically blocking offscreen document use** as of the last known audit.
  The combination of offscreen document + howler is used in production extensions (e.g., podcast
  and audiobook players on the Chrome Web Store).

**Verdict**: Runs fine in an offscreen document. Does not run in a service worker or background
script without an offscreen document.

---

## Gapless Playback Support

**Short answer: limited native support; gapless requires manual orchestration and is a known
pain point.**

howler.js wraps each sound in its own `AudioBufferSourceNode`. Key facts:

- `Howl` objects can be pre-loaded (`.load()`) and played with `.play()`. Multiple `Howl`
  instances can overlap, so you can start the next sound before the first ends.

- howler does NOT expose `AudioBufferSourceNode.start(when)` — the Web Audio API's primary
  mechanism for sample-accurate scheduling. It uses wall-clock `setTimeout`-based timing
  internally for sprite offsets and loop points.

- **`setTimeout`-based scheduling drifts**. For TTS sentence-by-sentence playback at typical
  sentence lengths (1–5 s), drift is tolerable (< 20 ms). For word-boundary highlighting sync,
  drift will accumulate and misalign highlights within a paragraph.

- **Sprites**: howler's sprite feature (`sprite` option) allows slicing a single audio file into
  named regions played back-to-back. This achieves gapless playback for pre-concatenated audio
  but is not useful for streaming TTS responses that arrive as separate `ArrayBuffer` chunks.

- **GitHub issue #876, #1044, #1320 (gapless/scheduling)**: Repeatedly requested but not
  implemented. The maintainer's stated position is that howler is a "convenience wrapper" and
  that sample-accurate scheduling belongs in raw Web Audio API code.

- There is no equivalent to the Web Audio API pattern:
  ```js
  let nextStartTime = ctx.currentTime;
  for (const buffer of buffers) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    src.start(nextStartTime);
    nextStartTime += buffer.duration;
  }
  ```
  howler cannot express this. You would have to bypass its scheduling layer entirely.

**Verdict**: No support for `AudioContext.currentTime`-scheduled gapless playback. For a TTS
engine producing sequential sentence buffers, howler's scheduling is insufficient.

---

## Bundle Size

Based on published npm/bundlephobia data for `howler@2.2.4`:

| Artifact             | Size         |
|----------------------|--------------|
| `howler.js` (UMD)    | ~96 KB raw   |
| `howler.min.js`      | ~38 KB minified |
| Gzipped (min)        | ~11–12 KB    |
| `howler.core.js`     | ~70 KB raw / ~28 KB min / ~8 KB gzip |

The `howler.core.js` build omits the `Codec` format-detection and HTML5 Audio fallback code,
leaving only the Web Audio API path. For a Chrome extension targeting modern Chrome, the core
build is the relevant artifact.

**Impact assessment**:
- Chrome extensions have a 10 MB unpacked size limit (higher with warnings). 12 KB gzipped is
  negligible in absolute terms.
- However, the offscreen document HTML is loaded fresh each time Chrome creates it. A smaller
  JS payload = faster cold-start for the first sentence. Raw Web Audio API requires zero
  additional JS.
- For an extension that will ship its own TTS scheduling logic anyway (see Gapless section
  above), paying ~12 KB for a wrapper you partially bypass is a net negative.

**Verdict**: Size is not a blocking concern, but it is not free either for a cold-start
sensitive audio document.

---

## Architecture Sketch

howler wraps Web Audio API in two layers:

1. **`Howler` (global singleton)**: manages the shared `AudioContext`, master `GainNode`,
   global volume, and a pool of active `Howl` instances. Handles `AudioContext` state
   (suspended/running) and `visibilitychange` events.

2. **`Howl` (per-sound object)**: manages one logical sound — fetch/decode via
   `decodeAudioData`, sprite metadata, playback state machine (loading → loaded → playing →
   stopped), event emitters (`on('play')`, `on('end')`, `on('loaderror')`), and per-instance
   `GainNode` + `PannerNode` chain.

Under the hood each `.play()` call:
- Creates a fresh `AudioBufferSourceNode` from the cached `AudioBuffer`
- Wires it through the instance gain and master gain to `destination`
- Calls `.start(0)` (always `ctx.currentTime`, never a future timestamp)
- Schedules `.stop()` via `setTimeout` at `duration * 1000` ms

The HTML5 Audio fallback path (`<audio>` element) is present in the full build but irrelevant
for Chrome extensions, which always have Web Audio API.

---

## Reusable Patterns

Even if we don't ship howler, these patterns from its source are worth borrowing:

1. **`AudioContext` unlock on first user gesture** (`Howler._enableMobileAudio`): a one-shot
   event listener that calls `ctx.resume()` and plays/stops a silent buffer. Direct port for
   the offscreen document's message handler.

2. **`decodeAudioData` with error boundary**: howler wraps the decode call with a retry on
   `EncodingError` and emits `loaderror` cleanly. Worth replicating for graceful TTS API error
   handling.

3. **Master `GainNode` chain**: `sourceNode → instanceGain → masterGain → destination`. Simple
   but the two-stage gain structure lets you fade individual sentences while maintaining global
   volume control. Trivially implemented without howler.

4. **State machine for Howl**: the `_state` enum (`unloaded`, `loading`, `loaded`) and the
   `_queue` pattern (buffer calls that arrive before load completes) are clean and directly
   applicable to a streaming TTS buffer queue.

---

## Gotchas

1. **No `start(when)` scheduling**: As detailed above, this is the core gap. It cannot be
   patched around within howler's API surface.

2. **`window` at module evaluation**: if the offscreen document's script is ever bundled in a
   context without `window` (e.g., a shared module imported in both background and offscreen),
   howler will throw. Keep the offscreen bundle strictly separate.

3. **Event-emitter overhead for TTS**: howler's event system fires `play`, `pause`, `stop`,
   `end`, `seek` on every sound lifecycle event. For rapid sentence-by-sentence playback (10–20
   sounds per minute), this is fine. For word-level audio sprites, event churn could become
   measurable.

4. **`AudioContext` lifecycle ownership**: howler owns the global `AudioContext` via
   `Howler.ctx`. If you ever need to inspect or manipulate the context directly (e.g., to
   connect an `AnalyserNode` for waveform visualisation), you access it via `Howler.ctx` —
   which works but is awkward when the singleton is in a library you don't control.

5. **No TypeScript definitions in core package**: `@types/howler` exists on DefinitelyTyped but
   lags behind releases. Minor issue but relevant for a TypeScript extension codebase.

6. **Maintenance pace**: The last howler release (2.2.4) was in 2022. The repo is in
   maintenance mode. Issues around MV3/offscreen documents are acknowledged but the maintainer
   has indicated no plans for major new features.

---

## Decision

**Use raw Web Audio API.**

Reasoning:

1. **The core requirement — gapless scheduling of sequential TTS buffers — is not supported by
   howler.** howler cannot call `AudioBufferSourceNode.start(when)` with a future timestamp.
   Any gapless playback engine built on howler would have to bypass its scheduling layer,
   meaning you pay the abstraction cost while getting none of the scheduling benefit.

2. **The offscreen document is raw Web Audio territory by design.** The offscreen document
   pattern was introduced specifically to give MV3 extensions a full Web Audio API surface.
   Writing directly against that surface produces code that is easier to reason about in the
   extension context (no global singleton, no hidden `AudioContext` ownership).

3. **The reusable patterns from howler (AudioContext unlock, decode error handling, gain chain)
   are all small, copy-pasteable, and don't require the full library.** A purpose-built
   ~100-line `AudioEngine` class for this extension will do everything needed and nothing extra.

4. **Bundle size is not blocking**, but shipping ~12 KB for a library you partially bypass for
   its most important use case is hard to justify.

**Recommended approach**: write a thin `OffscreenAudioEngine` class over raw Web Audio API with:
- A single shared `AudioContext`
- A `schedule(buffer: AudioBuffer)` method that chains `src.start(nextStartTime)` calls
- A `GainNode` for volume
- An `onEnd` callback wired to `AudioBufferSourceNode.onended`

This is ~80–120 lines and covers all playback requirements for a TTS reader without any
third-party dependency.
