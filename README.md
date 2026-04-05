# Recito

Open-source Chrome extension (Manifest V3) that turns any web page into an audiobook with karaoke-style word highlighting. Bring Your Own Key — works with OpenAI, ElevenLabs, Groq, Xiaomi Mimo, or any OpenAI-compatible TTS endpoint.

Inspired by Speechify, but open-source and provider-agnostic.

## Features

### TTS Providers (BYOK)

Five built-in providers, each with its own voice catalog and speed range:

| Provider | Voices | Speed range | Notes |
|----------|--------|-------------|-------|
| **OpenAI** | 6 (Alloy, Echo, Fable, Onyx, Nova, Shimmer) | 0.25–4.0x | Default choice for most users |
| **ElevenLabs** | Dynamic (fetched from account) | 0.7–1.2x | Word-level timing via `/with-timestamps`; Flash v2.5 (economy) or Multilingual v2 (quality) models; shows character usage & monthly quota |
| **Groq** | 10 PlayAI voices (English + Arabic) | 0.25–4.0x | Ultra-fast inference |
| **Xiaomi Mimo** | 3 built-in voices | — | Multilingual with emotion/dialect support |
| **Custom** | Configurable | 0.25–4.0x | Any OpenAI-compatible endpoint — set base URL, model, and API key |

You can add multiple API keys per provider. Keys are stored locally in `chrome.storage.local` — nothing leaves your browser.

### Playback & Highlighting

- **Word + sentence highlighting** — dual-layer karaoke highlighting as audio plays. Uses the CSS Custom Highlight API where supported, with a `<mark>` fallback for older browsers.
- **Configurable highlight colors** — 6 preset color pairs or custom RGBA values for word and sentence layers.
- **Auto-scroll** — smoothly scrolls the highlighted text to the center of the viewport. Pauses automatically when you scroll manually (resumes after 5 seconds).
- **Text scrubber** — hover over any text on the page to preview chunk boundaries; click to seek directly to that position.
- **Reading progress & resume** — automatically saves your position per URL (7-day TTL). When you revisit a page, the extension offers to resume where you left off.
- **Selection reading** — select text on a page to read just that selection instead of the full article.
- **Speed slider** — continuous slider (0.25–4.0x) with snap-to-preset chips at 1x, 1.25x, 1.5x, 2x. Range clamps automatically per provider.
- **Prefetch buffer** — synthesizes 2 chunks ahead for gapless playback (configurable).

### Content Extraction

- **Smart extraction** — uses Mozilla Readability with a custom scoring heuristic that considers tag type, class/ID patterns, paragraph density, and link density to find the main content.
- **Gmail support** — detects Gmail and extracts email body from Gmail-specific DOM selectors.
- **Noise stripping** — removes nav, footer, header, aside, ads, comments, and cookie banners before extraction.
- **Sentence-based chunking** — splits text into sentence-level chunks. Provider-specific sizing: smaller chunks for Groq (15–25 words) for better quality, larger chunks for others (30–50 words) for better prosody.

### Provider Health & Failover

- **Automatic failover** — if a provider returns an error, the extension tries the next healthy config in the same provider group (up to 3 attempts per chunk).
- **Smart cooldowns** — 401 = permanent failure (bad key), 429 = 1-min cooldown (rate limit), 403 = 5-min cooldown (quota), 5xx/network = 30-sec cooldown.
- **ElevenLabs voice verification** — on failover, verifies the target voice exists on the new account before switching.

### UI

- **Floating toolbar** — draggable, collapsible toolbar injected into any page. Collapsed mode shows play/pause with circular progress, skip buttons, volume, and speed. Expanded mode adds a full progress bar, provider selector, and speed slider. Auto-hides when native video/audio plays.
- **Options page** — full settings panel with sections for Appearance (theme: system/light/dark), Providers, Voices, Playback, Highlighting, Hotkeys, and Advanced (settings reset).
- **Popup** — quick-access panel showing playback state, play/pause, speed/volume, word count, and current position.
- **Onboarding wizard** — 3-step setup flow for first-time users.
- **Toast notifications** — non-intrusive feedback for failover events and errors.

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Alt+Shift+Space` | Play / Pause |
| `Alt+Shift+Right` | Skip forward |
| `Alt+Shift+Left` | Skip backward |

## Installation

### Chrome Web Store

Coming soon.

### Developer Install

1. Clone the repository:
   ```bash
   git clone https://github.com/allgemeiner-intellekt/recito.git
   cd recito
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the extension:
   ```bash
   npm run build
   ```

4. Load in Chrome:
   - Open `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` folder

For development with hot reload:
```bash
npm run dev
```

## Usage

1. Click the Recito icon in your toolbar
2. Add a TTS provider and API key in the options page
3. Navigate to any web page and click **Play** in the popup or floating toolbar
4. The page will be read aloud with word-by-word highlighting

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## Security

See [SECURITY.md](./SECURITY.md) for information on how API keys are stored and our security practices.

## License

MIT — see [LICENSE](./LICENSE) for details.
