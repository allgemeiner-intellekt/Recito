# Recito

Open-source Chrome extension (Manifest V3) for text-to-speech with BYOK (Bring Your Own Key). Inspired by Speechify but supports Groq, ElevenLabs, OpenAI, and any OpenAI-compatible TTS provider.

## Tech stack

TypeScript 5 (strict), React 18, Vite 5 + @crxjs/vite-plugin, Zustand 5, Vitest

## Commands

- `npm run dev` — dev build with hot reload
- `npm run build` — production build (`tsc && vite build`, output in `dist/`)
- `npm run typecheck` — type-check only
- `npm run lint` — ESLint
- `npm run test` — Vitest

## Path aliases

- `@shared/*` → `src/lib/*`
- `@providers/*` → `src/providers/*`

## Key architecture

- **Message passing**: All inter-context communication via typed messages (`src/lib/messages.ts`, `MSG` enum). Background ↔ content ↔ offscreen.
- **TTS flow**: Content extracts text → chunker splits into 15-25 word chunks → background orchestrator sends chunks to TTS provider → audio played in offscreen document → playback progress drives word highlighting.
- **Highlighting**: `buildTextNodeMap()` walks live DOM text nodes and records character offsets. `HighlightManager` creates Ranges from these offsets. Chunk offsets are recomputed against the DOM text map (not Readability text) to avoid misalignment.
- **Word timing**: Providers with real word-level timing data use it directly. Otherwise, interpolation uses character-weighted word durations (longer words get proportionally more time).
- **Storage**: Provider configs and settings in `chrome.storage.local` (never sync).
