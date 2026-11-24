# Recito

Open-source Chrome extension (Manifest V3) for text-to-speech with BYOK (Bring Your Own Key). Inspired by Speechify but supports Xiaomi MiMo, OpenAI, and custom OpenAI-compatible TTS services.

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
- **TTS flow**: Content extracts visual blocks → chunker splits each block into sentence chunks (never across blocks; headings stay whole) → background orchestrator sends chunks to TTS provider with 2-chunk prefetch buffer → audio played in offscreen document → playback progress drives word highlighting.
- **Content extraction**: Site extractors (Gmail, AI chat, generic) only decide *which live text nodes* are content (`ContentScope.include`). Generic runs Readability on a clone and maps its output back to live text nodes by two identities, since Readability breaks each in some case: clone text nodes (paired with live ones by a parallel walk; Readability moves them even when it rebuilds elements) and uniquely *named* element marker attributes (they survive Readability's re-parse-from-HTML retry; unique names because unwrapping copies a wrapper's attributes onto its child). Heuristic scoring + noise exclusion is the fallback. `collectBlocks()` then walks the live DOM into blocks by computed `display` (a heading ancestor always wins; `<br><br>` breaks a paragraph), skipping invisible text (hidden elements, collapsed `<details>`).
- **Highlighting**: `buildTextNodeMap()` walks live DOM text nodes and records character offsets. `HighlightManager` creates Ranges from these offsets using CSS Custom Highlight API (with `<mark>` fallback). Dual-layer: word highlight + sentence highlight. Page and selection chunks carry `domOffsets` (DOM offset per character) taken from the same body text map the highlighter uses, so chunks are anchored by construction; never locate chunks by searching page text. WeRead chunks omit `domOffsets` and are verbatim slices of the chapter text.
- **Word timing**: Current adapters use character-weighted interpolation. Preserve the generic provider timing path for future adapters.
- **Text scrubber**: Hover scrubbing maps screen coordinates to chunk indices via `caretPositionFromPoint`/`caretRangeFromPoint`. Click to seek.
- **Auto-scroll**: Smooth scroll to viewport center. Pauses on manual scroll (wheel/touch), resumes after 5-second timeout.
- **Speed control**: `SpeedSlider` component with provider-aware min/max clamping. Snap-to-preset behavior. Providers define their own speed ranges (e.g., OpenAI/Custom 0.5–2.0x, Mimo has no speed control).
- **Provider health & failover**: Per-config health status (healthy/cooldown/failed). Smart cooldowns based on HTTP status. Auto-failover to next healthy config in same provider group (up to 3 attempts).
- **Provider groups**: Multiple API keys per provider. Standard providers grouped by `providerId`, custom providers grouped by `custom:{baseUrl}`. Active provider stored per group.
- **Reading progress**: URL-based position saved in `chrome.storage.local` with 7-day TTL. Auto-saves after each chunk; clears on completion.
- **Storage**: Provider configs and settings in `chrome.storage.local` (never sync).
- **State sync model**: Content script Zustand store receives state updates from the background via typed messages. Background `PlaybackStateManager` is the single source of truth. Session generation is incremented on every config switch/failover so that in-flight synthesis results from the stale session are discarded. Only one tab plays at a time; starting playback on a new tab aborts the previous session.

## Providers

| Provider | ID | Speed range | Word timing | Notes |
|----------|----|-------------|-------------|-------|
| OpenAI | `openai` | 0.5–1.5x | Interpolated | Realtime API (`gpt-realtime-2.1-mini`), 10 voices; non-OpenAI base URLs keep legacy `/audio/speech` |
| Xiaomi Mimo | `mimo` | None | Interpolated | Built-in MiMo synthesis integration |
| Custom | `custom` | 0.5–2.0x | Interpolated | Any OpenAI-compatible endpoint |

## UI surfaces

- **Floating toolbar** (`src/content/`) — draggable, collapsible, injected into page. Collapsed: play/pause with circular progress, skip, volume, speed chip. Expanded: progress bar, provider selector, speed slider.
- **Options page** (`src/options/`) — Appearance, Providers, Voices, Playback, Highlighting, Hotkeys, Advanced.
- **Popup** (`src/popup/`) — quick playback controls, page info.
- **Onboarding** — 3-step wizard for first-time setup.
- **Offscreen document** (`src/offscreen/`) — audio playback in separate execution context.
