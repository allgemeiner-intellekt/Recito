# Plan 03: Audio Pipeline & Playback Engine

**Estimated effort:** 4–5 days
**Depends on:** Plan 01 (providers), Plan 02 (extraction/chunking)
**Unlocks:** Plan 04 (toolbar), Plan 06 (highlighting)

## Objective

Build the core audio playback engine: the service worker orchestrates TTS synthesis with look-ahead buffering, the offscreen document handles Web Audio API playback, and the content script receives word-timing events for highlighting. After this plan, you can trigger playback from the console and hear a full page read aloud with smooth chunk transitions.

## Tasks

### 1. Offscreen document audio player (`/src/offscreen/player.ts`)

- Create offscreen document via `chrome.offscreen.createDocument()` with reason `AUDIO_PLAYBACK`
- Implement `AudioPlayer` class:
  - `AudioContext` instance with a single output node chain
  - `play(audioData: ArrayBuffer, format: string): Promise<void>` — decode and play
  - `pause()` / `resume()` / `stop()`
  - `setSpeed(rate: number)` — adjust `playbackRate` (0.5–3.0)
  - `setVolume(level: number)` — GainNode (0.0–1.0)
  - Emit events: `onTimeUpdate(currentTime)`, `onEnded()`, `onError(err)`
- Handle audio format decoding: mp3, opus, wav, aac via `decodeAudioData`

### 2. Playback state machine (`/src/background/playback-state.ts`)

- States: `IDLE` → `LOADING` → `PLAYING` ↔ `PAUSED` → `IDLE`
- Transitions triggered by user actions or audio events
- State is the single source of truth; all UI reads from it
- Expose via message passing to popup and content script

### 3. Chunk orchestrator (`/src/background/orchestrator.ts`)

- Manages the synthesis-and-play pipeline:
  1. Request chunk N text from content script
  2. Send to active provider's `synthesize()`
  3. Send audio buffer to offscreen document for playback
  4. While chunk N plays, prefetch chunks N+1 and N+2 (look-ahead buffer)
  5. On chunk N `onEnded`, immediately start chunk N+1 from buffer
  6. Repeat until all chunks are done
- **Prefetch buffer**: store up to 2 pre-synthesized `AudioBuffer`s in memory
- **Error handling**:
  - Provider error → pause playback, notify user via popup/toolbar
  - Rate limit (429) → exponential backoff, retry up to 3 times
  - Network error → pause and surface error message

### 4. Word timing relay (`/src/background/word-timing.ts`)

- If provider returns `wordTimings` (OpenAI with `verbose_json`):
  - Relay timing events to content script: `{ chunkIndex, wordIndex, startTime, endTime }`
- If provider does NOT return word timings (ElevenLabs, Groq):
  - **Linear interpolation fallback**: `wordDuration = chunkDuration / wordCount`
  - Generate synthetic timing events at regular intervals
- Content script receives these events to drive highlighting (Plan 06)

### 5. Transport controls API (`/src/background/transport.ts`)

- Expose message-based API for UI to call:
  - `PLAY` — start or resume playback
  - `PAUSE` — pause
  - `STOP` — stop and reset to beginning
  - `SKIP_FORWARD` — jump to next sentence
  - `SKIP_BACKWARD` — jump to previous sentence
  - `SET_SPEED` — change playback rate
  - `SET_VOLUME` — change volume
  - `GET_STATE` — return current state (playing/paused, current chunk, speed, volume, progress %)
- Keyboard shortcuts registered via `chrome.commands`:
  - Space → play/pause
  - ArrowRight → skip forward
  - ArrowLeft → skip backward
  - `+` / `-` → speed up / down

### 6. Service worker message routing (`/src/background/index.ts`)

- Central message handler that routes all messages between:
  - Popup ↔ Service Worker
  - Content Script ↔ Service Worker
  - Service Worker ↔ Offscreen Document
- Keep the service worker alive during playback (MV3 service worker lifetime management)
  - Use `chrome.runtime.onConnect` with long-lived ports
  - Or periodic `chrome.alarms` as keepalive

### 7. Integration test

- End-to-end test: load a test page → extract → synthesize chunk 1 with a mock provider → play audio → verify `onEnded` triggers chunk 2
- Test pause/resume mid-chunk
- Test skip forward/backward
- Test speed change during playback

## Exit Criteria

- [ ] Audio plays from start to finish on a multi-paragraph page without gaps between chunks
- [ ] Look-ahead buffering: chunk N+1 starts within 50ms of chunk N ending
- [ ] Pause/resume works mid-sentence without audio artifacts
- [ ] Skip forward/backward navigates between sentences correctly
- [ ] Speed control (0.5x–3x) works in real-time without restarting playback
- [ ] Volume control works
- [ ] Word timing events fire at approximately correct intervals (real or interpolated)
- [ ] Provider errors surface as user-visible messages (no silent failures)
- [ ] Service worker stays alive for the duration of playback
- [ ] Time to first audio < 400ms with OpenAI/Groq on a short chunk (manual test)

## Deliverables

- Offscreen document audio player with Web Audio API
- Playback state machine
- Chunk orchestrator with look-ahead buffering
- Word timing relay (real + interpolated)
- Transport controls message API
- Service worker message routing
- Keyboard shortcut registration
