# Immersive Reader

Chrome Extension (Manifest V3) that provides AI-powered text-to-speech with real-time word/sentence highlighting. Uses any OpenAI-compatible TTS endpoint (designed for `openai-edge-tts` at `localhost:5050`).

## Commands

```bash
npm run dev        # Vite dev server with HMR (load dist/ as unpacked extension)
npm run build      # tsc + vite build → dist/
```

After building, load `dist/` folder at `chrome://extensions` (developer mode, "Load unpacked").

## Architecture

Three isolated execution contexts communicate via `chrome.runtime` message passing:

```
Content Script ←→ Service Worker ←→ Offscreen Document
(React UI,        (message router)   (TTS fetch,
 highlighting,                        MSE audio
 extraction)                          playback)
```

### Message flow

All messages are typed in `src/shared/messages.ts` as a discriminated union on `type`. The service worker (`src/background/message-router.ts`) is a pure router — it never processes messages, only forwards between contexts. Content→offscreen messages are fire-and-forget; the offscreen document sends `SEGMENT_COMPLETE` / `PLAYBACK_ERROR` back asynchronously.

### Content script (`src/content/`)

- Mounts a React app inside a **Shadow DOM** (`mount.tsx`) to isolate styles from the host page
- `App.tsx` is the orchestrator: manages playback state (Zustand), listens for messages, coordinates segment transitions
- `extraction/` — `@mozilla/readability` for article extraction, with `findArticleRoot()` fallback using CSS selectors (Wikipedia `.mw-parser-output`, `article`, `main`, etc.)
- `highlighting/` — wraps text nodes in `<span>` elements; sentence gets `#F5F5F5` background, active word gets `#3A3A3A` bg + white text; timing is estimated from character proportions with EMA correction
- `injection/` — injects "Play" buttons on text blocks with 200+ words (vanilla DOM, not React)

### Offscreen document (`src/offscreen/`)

- `audio-player.ts` — `AudioPlayer` class streams TTS responses into MSE (`MediaSource` → `SourceBuffer`); buffers ≥4096 bytes before calling `play()` to prevent stutter; supports prefetching the next segment with a separate `AbortController`
- The `playSegment()` Promise resolves only when the audio `ended` event fires, but the offscreen message handler does NOT await it — it returns `{ ok: true }` immediately

### Shared code (`src/shared/`)

- `@shared/*` path alias defined in both `tsconfig.json` and `vite.config.ts`
- `types.ts` — `TTSSettings`, `Segment`, `PlaybackState`, `ExtractionResult`, etc.
- `constants.ts` — all magic numbers (segment sizing, speed bounds, player dimensions)

### Key invariants

- **Segment ID validation**: `SEGMENT_COMPLETE` and `PLAYBACK_ERROR` handlers in `App.tsx` compare `message.segmentId` against the current segment before acting — stale messages from previous segments are ignored
- **Prefetch isolation**: Prefetch uses its own `AbortController` separate from active playback fetch, so cancelling a prefetch never aborts the playing segment
- **No direct DOM manipulation from React**: Highlighting and play-button injection operate on the host page DOM directly; the React tree lives entirely inside the Shadow DOM
