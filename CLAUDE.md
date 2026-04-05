# Recito

Open-source Chrome extension (Manifest V3) for text-to-speech with BYOK (Bring Your Own Key). Inspired by Speechify but supports OpenAI, ElevenLabs, Groq, Xiaomi Mimo, and any OpenAI-compatible TTS provider.

## Tech stack

TypeScript 5 (strict), React 18, Vite 5 + @crxjs/vite-plugin, Zustand 5, Vitest, Mozilla Readability

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
- **TTS flow**: Content extracts text → sentence-based chunker splits into chunks (provider-specific sizing: 15–25 words for Groq, 30–50 words for others) → background orchestrator sends chunks to TTS provider with 2-chunk prefetch buffer → audio played in offscreen document → playback progress drives word highlighting.
- **Content extraction**: Smart heuristic scoring (tag type, class/ID patterns, paragraph density, link density) on top of Mozilla Readability. Gmail-specific extraction. Noise stripping (nav, footer, ads, comments, cookies).
- **Highlighting**: `buildTextNodeMap()` walks live DOM text nodes and records character offsets. `HighlightManager` creates Ranges from these offsets using CSS Custom Highlight API (with `<mark>` fallback). Dual-layer: word highlight + sentence highlight. Chunk offsets are recomputed against the DOM text map (not Readability text) to avoid misalignment.
- **Word timing**: ElevenLabs provides character-level alignment converted to word timings. Other providers use character-weighted interpolation (longer words get proportionally more time).
- **Text scrubber**: Hover scrubbing maps screen coordinates to chunk indices via `caretPositionFromPoint`/`caretRangeFromPoint`. Click to seek.
- **Auto-scroll**: Smooth scroll to viewport center. Pauses on manual scroll (wheel/touch), resumes after 5-second timeout.
- **Speed control**: `SpeedSlider` component with provider-aware min/max clamping. Snap-to-preset behavior. Providers define their own speed ranges (e.g., ElevenLabs 0.7–1.2x, OpenAI/Groq 0.25–4.0x, Mimo has no speed control).
- **Provider health & failover**: Per-config health status (healthy/cooldown/failed). Smart cooldowns based on HTTP status. Auto-failover to next healthy config in same provider group (up to 3 attempts). ElevenLabs voice verification on failover.
- **Provider groups**: Multiple API keys per provider. Standard providers grouped by `providerId`, custom providers grouped by `custom:{baseUrl}`. Active provider stored per group.
- **Reading progress**: URL-based position saved in `chrome.storage.local` with 7-day TTL. Auto-saves after each chunk; clears on completion.
- **Storage**: Provider configs and settings in `chrome.storage.local` (never sync).

## Providers

| Provider | ID | Speed range | Word timing | Notes |
|----------|----|-------------|-------------|-------|
| OpenAI | `openai` | 0.25–4.0x | Interpolated | 6 built-in voices |
| ElevenLabs | `elevenlabs` | 0.7–1.2x | Native (character alignment) | Flash v2.5 / Multilingual v2 models; usage tracking |
| Groq | `groq` | 0.25–4.0x | Interpolated | 10 PlayAI voices (EN + AR); smaller chunk sizing |
| Xiaomi Mimo | `mimo` | None | Interpolated | Multilingual with emotion/dialect support |
| Custom | `custom` | 0.25–4.0x | Interpolated | Any OpenAI-compatible endpoint |

## UI surfaces

- **Floating toolbar** (`src/content/`) — draggable, collapsible, injected into page. Collapsed: play/pause with circular progress, skip, volume, speed chip. Expanded: progress bar, provider selector, speed slider.
- **Options page** (`src/options/`) — Appearance, Providers, Voices, Playback, Highlighting, Hotkeys, Advanced.
- **Popup** (`src/popup/`) — quick playback controls, page info.
- **Onboarding** — 3-step wizard for first-time setup.
- **Offscreen document** (`src/offscreen/`) — audio playback in separate execution context.
