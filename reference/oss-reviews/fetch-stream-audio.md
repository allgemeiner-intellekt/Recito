# fetch-stream-audio — Audio Pipeline Review

Source: https://github.com/AnthumChris/fetch-stream-audio
Reviewed: 2026-03-29
Commit reviewed: master branch (shallow clone)

---

## Architecture Sketch

The pipeline is a four-stage chain, all running in a browser context with one Web Worker per player instance:

```
Fetch (ReadableStream)
  -> BufferedStreamReader       [main thread]  accumulates raw bytes into fixed-size chunks
  -> Worker (WAV or Opus)       [worker thread] decodes chunk to Float32Array per channel
  -> DecodedAudioPlaybackBuffer [worker thread, Opus only] coalesces tiny decoded frames into larger flush units
  -> AudioStreamPlayer._schedulePlayback()  [main thread] creates AudioBufferSourceNode and schedules it on AudioContext timeline
```

**Key classes and files:**

| File | Role |
|---|---|
| `src/js/modules/buffered-stream-reader.mjs` | Wraps `fetch()` ReadableStream, re-chunks incoming bytes into fixed `readBufferSize` units (2 KB for Opus, 16 KB for WAV), calls `onBufferFull` when a chunk is ready |
| `src/js/worker-decoder-wav.js` | Web Worker; synchronously decodes PCM WAV chunks via `MohayonaoWavDecoder.decodeChunkSync()` |
| `src/js/worker-decoder-opus.js` | Web Worker; asynchronously decodes Opus via WebAssembly `OpusStreamDecoder`, routes decoded PCM through `DecodedAudioPlaybackBuffer` before posting to main thread |
| `src/js/modules/decoded-audio-playback-buffer.mjs` | Intermediate coalescing buffer (Opus only); starts at 20 ms / 960 samples and exponentially grows flush size up to 128 KB over 50 flushes |
| `src/js/modules/audio-stream-player.mjs` | Owns `AudioContext`, receives decoded PCM from worker, calls `_schedulePlayback()`, tracks timing state |
| `src/js/modules/audio-player.mjs` | Thin UI adapter around `AudioStreamPlayer` |

Decoded channel data is transferred (not copied) between Worker and main thread using `postMessage` transferable buffers — zero-copy hand-off.

---

## Reusable Patterns

### 1. Buffer re-chunking before decode (BufferedStreamReader)

The Fetch ReadableStream delivers variable-size TCP chunks. The WAV decoder requires exactly-aligned chunks or it produces white noise. `BufferedStreamReader._readIntoBuffer()` solves this by accumulating bytes into a fixed `Uint8Array(readBufferSize)` and only firing `onBufferFull` when that buffer is full (or the stream ends):

```js
// Pattern: fill buffer, fire callback only when full
while (srcStart < srcLen) {
  const len = Math.min(bufferLen - bufferPos, srcLen - srcStart);
  this.buffer.set(src.subarray(srcStart, end), bufferPos);
  srcStart += len;
  bufferPos += len;
  if (bufferPos === bufferLen) {
    bufferPos = 0;
    this._flushBuffer({ end: Infinity, done, request });
  }
}
```

Critical insight: the `setTimeout` that wraps `_readIntoBuffer` prevents the decode from blocking the fetch loop — it intentionally decouples I/O from processing.

### 2. Gapless playback — the scheduling math (AudioStreamPlayer._schedulePlayback)

This is the core of the project and the most important pattern to adapt:

```js
// First buffer only: add 100ms start delay so first Opus frame (up to 60ms) has time to decode
if (!this._playStartedAt) {
  startDelay = 100 / 1000;  // 100 ms
  this._playStartedAt = this._audioCtx.currentTime + startDelay;
}

// Every buffer: schedule at absolute wall-clock position on the AudioContext timeline
const startAt = this._playStartedAt + this._totalTimeScheduled;

// Skip detection: if AudioContext clock already passed startAt, we have an underrun
if (this._audioCtx.currentTime >= startAt) {
  this._skips++;
}

audioSrc.start(startAt);
this._totalTimeScheduled += audioBuffer.duration;  // advance cursor by exact buffer duration
```

**The invariant:** `_playStartedAt` is set once (wall-clock anchor). Every subsequent buffer is scheduled at `anchor + cumulative_duration`. This eliminates gaps because there is no re-computation of "when is now" for each buffer — the cursor advances by exact sample count duration, not by wall clock, so rounding and jitter cannot accumulate between chunks.

### 3. Exponential flush growth (DecodedAudioPlaybackBuffer)

For Opus, decoded frames arrive very small (960 samples at 48 kHz = 20 ms). Creating one `AudioBufferSourceNode` per frame would create thousands of nodes and degrade scheduling precision. The fix: coalesce decoded frames into progressively larger buffers:

```js
static firstFlushLength = 0.02 * 48000;  // 960 samples = 20ms
static maxFlushSize = 1024 * 128;         // 128 KB ceiling
static maxGrows = 50;                     // number of flushes before plateau

// Exponential grow coefficient
static growFactor = Math.pow(
  maxFlushSize / 4 / firstFlushLength,
  1 / (maxGrows - 1)
);

static flushLength = (flushCount) => {
  const flushes = Math.min(flushCount, maxGrows - 1);
  return Math.round(firstFlushLength * Math.pow(growFactor, flushes));
}
```

Start small to minimize time-to-first-audio; grow quickly to reduce AudioBufferSourceNode churn once playback is stable. The 128 KB / 4 bytes-per-sample = 32,768 sample ceiling (roughly 682 ms at 48 kHz).

### 4. Session ID for race condition prevention

When a user stops and immediately starts a new stream, in-flight worker messages from the old session can arrive and get scheduled on the new AudioContext. The fix is a lightweight session ID:

```js
// on start():
this._sessionId = performance.now();

// postMessage carries sessionId
this._worker.postMessage({ decode: bytes.buffer, sessionId }, [bytes.buffer]);

// in _onWorkerMessage():
if (!(this._sessionId && this._sessionId === sessionId)) {
  console.log("race condition detected for closed session");
  return;  // discard stale decode result
}
```

### 5. Safari AudioBufferSourceNode onended fix

Safari does not reliably fire `onended` unless the source node is kept in a live array. The repo explicitly documents this:

```js
// adding also ensures onended callback is fired in Safari
this._audioSrcNodes.push(audioSrc);

audioSrc.onended = () => {
  this._audioSrcNodes.shift();  // clean up reference
  this._abEnded++;
};
```

### 6. Read buffer size tuning (empirical values)

From `load-audio-players.mjs`:
- Opus: `readBufferSize = 1024 * 2` (2 KB) — "2-4k seemed good for opus to prevent skipping; larger delays audio start"
- WAV: `readBufferSize = 1024 * 16` (16 KB) — "WAV trials showed 16K to be good. Lower values (2K) caused skipping"

### 7. AudioContext creation with latencyHint

```js
this._audioCtx = new AudioContext({ latencyHint: 'interactive' });
```

Using `'interactive'` rather than `'playback'` minimizes hardware buffer size, critical for low-latency streaming.

### 8. Latency measurement

The repo measures latency from first byte received to scheduled play start:

```js
this._updateState({
  latency: performance.now() - this._getDownloadStartTime() + startDelay * 1000
});
```

Where `_getDownloadStartTime()` uses `performance.mark()` at `start()` call time. The 100 ms `startDelay` is added to the reported latency figure because it is intentional — not network delay.

---

## Gotchas

### AudioContext autoplay policy (user gesture requirement)
`AudioContext` construction does not autoplay in modern browsers without a user gesture. The repo calls `audioCtx.resume()` immediately after construction in `start()`, which works because `start()` is always called from a click handler. For Immersive Reader, the TTS pipeline starts from a user highlight/click action, so this is naturally satisfied — but be careful if any part of the pipeline triggers audio programmatically (e.g., auto-read on page load).

### Firefox outputLatency vs baseLatency
The repo comments note that Firefox's `outputLatency` can be ~250 ms (too long for startDelay) while `baseLatency` or `128 / sampleRate` are more useful:

```js
// 100ms allows enough time for largest 60ms Opus frame to decode
startDelay = 100 / 1000;
// Alternatives tried:
// audioCtx.baseLatency || (128 / audioCtx.sampleRate)  -- clips in Firefox
// audioCtx.baseLatency || (256 / audioCtx.sampleRate)  -- works in Firefox
// audioCtx.outputLatency || ...  -- ~250ms, too long
```

The 100 ms hardcoded value is a pragmatic compromise across browsers.

### Opus decoder signals no EOF
The Opus WebAssembly decoder does not emit an end-of-stream event. The repo works around this with a 100 ms debounced flush timeout:

```js
function scheduleLastFlush() {
  clearTimeout(flushTimeoutId);
  flushTimeoutId = setTimeout(_ => playbackBuffer.flush(), 100);
}
```

This means the final audio chunk has an extra ~100 ms decode latency. For TTS streaming (where ElevenLabs/similar sends PCM or Opus frames), we may be able to drive flush explicitly from stream termination signals rather than a timeout.

### Decoder negative samplesDecoded recovery
The Opus decoder (opus-stream-decoder) occasionally returns negative `samplesDecoded` when recovering from a corrupted or re-started stream. The code silently skips these frames:

```js
if (samplesDecoded < 0) { return; }
```

This is relevant for TTS: if we restart the stream mid-sentence (seek, cancel), the decoder may briefly emit garbage.

### WAV decoder state carries across chunks
`MohayonaoWavDecoder` parses the RIFF header only on the first call and caches `readerMeta`. If the same worker instance receives a new WAV stream (different file), the cached meta will be wrong. The session ID pattern (above) handles this by resetting the worker state when a new session starts — but for WAV the worker itself has no reset. The repo sidesteps this by closing and recreating the worker on reset (via `close()` -> new `start()`).

### No gap/skip recovery
If `audioCtx.currentTime >= startAt` (an underrun), the code increments `_skips` and calls `audioSrc.start(startAt)` anyway — passing an already-elapsed timestamp. The Web Audio spec will start the node immediately in this case, but there will be an audible skip. There is no skip recovery logic (e.g., re-anchoring `_playStartedAt` to `currentTime`). For TTS streaming where network is LLM-throttled, we may need to implement underrun recovery.

### Single AudioContext per player instance
The AudioContext is created in `start()` and closed in `close()`. There is no pooling or reuse. Each play session creates a fresh context. This is safe but means we pay context initialization cost on every start. On mobile browsers, context initialization can take 30–100 ms.

### Transferable buffer invalidation
After `postMessage({ decode: bytes.buffer }, [bytes.buffer])`, the `bytes.buffer` `ArrayBuffer` in the main thread is detached (zero-length). The code correctly does not access it after transfer, but any caller that holds a reference to the same `Uint8Array` will see zeroed data. This is already handled in `BufferedStreamReader` because `buffer.slice()` is used (creates a copy) before transfer.

---

## Decision

**Take inspiration only — do not use as a dependency, do not copy verbatim.**

Rationale:

1. **TTS-specific mismatch:** fetch-stream-audio is designed for streaming a pre-existing audio file URL via Fetch. Immersive Reader's pipeline receives TTS audio from an API (ElevenLabs, OpenAI TTS, etc.) that streams PCM/MP3/Opus over an HTTP response or WebSocket — the ingestion point is different, but the downstream scheduling logic is directly applicable.

2. **The scheduling math is gold:** The `_playStartedAt + _totalTimeScheduled` cursor pattern is exactly what we need for our look-ahead buffer. Adapt this verbatim into our `AudioScheduler` class.

3. **The exponential flush coalescing (DecodedAudioPlaybackBuffer) is directly adaptable** for our TTS pipeline, where decoded audio frames from ElevenLabs arrive as small PCM chunks and need to be batched before scheduling to avoid AudioBufferSourceNode thrash.

4. **No package to import:** The README explicitly says "no formal package" (issue #21). The npm package `@puresignal/fetch-stream-audio` exists as a community fork but is unmaintained. We should not take a runtime dependency on either.

5. **Key values to carry forward into our implementation:**
   - `startDelay = 100ms` for first buffer (covers largest Opus frame decode time; adjust based on TTS codec)
   - `readBufferSize`: 2 KB for Opus, 16 KB for PCM — use as baseline, make configurable
   - Exponential growth from 20 ms (960 samples @ 48 kHz) to 128 KB over 50 flushes
   - Session ID pattern for cancel/restart race condition safety
   - `copyToChannel()` with fallback for cross-browser AudioBuffer population
   - Keep live array of AudioBufferSourceNodes for Safari `onended` reliability
   - `latencyHint: 'interactive'` on AudioContext construction
