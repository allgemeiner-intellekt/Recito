# Recito

Open-source Chrome extension (Manifest V3) that turns any web page into an audiobook with karaoke-style word highlighting. Bring Your Own Key — works with Xiaomi MiMo, OpenAI, or a custom OpenAI-compatible TTS endpoint.

Inspired by Speechify, but open-source and provider-agnostic.

## Features

### TTS Providers (BYOK)

Two dedicated providers and a Custom entry for compatible services:

| Provider | Voices | Speed range | Notes |
|----------|--------|-------------|-------|
| **OpenAI** | 6 (Alloy, Echo, Fable, Onyx, Nova, Shimmer) | 0.5–2.0x | Existing speech API integration |
| **Xiaomi Mimo** | MiMo v2.5 built-in voices | — | `mimo-v2.5-tts`, complete audio playback |
| **Custom** | Configurable | 0.5–2.0x | Any OpenAI-compatible endpoint — set base URL, model, and API key |

You can add multiple API keys per provider. Keys are stored locally in `chrome.storage.local` — nothing leaves your browser.

### Playback & Highlighting

- **Word + sentence highlighting** — dual-layer karaoke highlighting as audio plays. Uses the CSS Custom Highlight API where supported, with a `<mark>` fallback for older browsers.
- **Configurable highlight colors** — 6 preset color pairs or custom RGBA values for word and sentence layers.
- **Auto-scroll** — smoothly scrolls the highlighted text to the center of the viewport. Pauses automatically when you scroll manually (resumes after 5 seconds).
- **Text scrubber** — hover over any text on the page to preview chunk boundaries; click to seek directly to that position.
- **Reading progress & resume** — automatically saves your position per URL (7-day TTL). When you revisit a page, the extension offers to resume where you left off.
- **Selection reading** — select text on a page to read just that selection instead of the full article.
- **Speed slider** — continuous slider (0.5–2.0x) with snap-to-preset chips at 1x, 1.25x, 1.5x, 2x. Range clamps automatically per provider.
- **Prefetch buffer** — synthesizes 2 chunks ahead for gapless playback (configurable).

### Content Extraction

- **Smart extraction** — uses Mozilla Readability with a custom scoring heuristic that considers tag type, class/ID patterns, paragraph density, and link density to find the main content.
- **Gmail support** — detects Gmail and extracts email body from Gmail-specific DOM selectors.
- **Noise stripping** — removes nav, footer, header, aside, ads, comments, and cookie banners before extraction.
- **Sentence-based chunking** — splits text into sentence-level chunks. Chunks target 30–50 words, preserving sentence boundaries for better prosody.

### Provider maintenance scope

Dedicated adapters are maintained for MiMo and OpenAI. Other services must expose an OpenAI-compatible speech API to work through Custom. Provider-specific voice discovery, timestamps, and quota tracking are not available through this generic interface.

Saved Groq and ElevenLabs configurations remain in local storage and appear as unsupported in Settings. They cannot be activated or used for playback. If a retired provider was active, select a maintained provider again. Delete the old configuration when you no longer need its saved key; configure compatible services manually through Custom.

MiMo uses `mimo-v2.5-tts` on the official endpoint. Saved official configurations with a missing model or `mimo-v2-tts` migrate automatically, keeping their API keys. Only the v2.5 voice catalog is offered; users with a saved historical or unavailable voice must select a voice again in Settings > Voices. `mimo_default` follows the deployment cluster, while named voices explicitly identify Chinese or English. Nonofficial MiMo base URLs keep their explicit model names and historical default; their compatibility with the current voice catalog must be checked with the service. See [provider details](PROVIDERS.md). OpenAI API migration remains tracked separately in #7.

### Provider Health & Failover

- **Automatic failover** — if a provider returns an error, the extension tries the next healthy config in the same provider group (up to 3 attempts per chunk).
- **Smart cooldowns** — 401 = permanent failure (bad key), 429 = 1-min cooldown (rate limit), 403 = 5-min cooldown (quota), 5xx/network = 30-sec cooldown.

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

### Download a Cloud Build

No local Node.js installation or compilation is required.

1. Sign in to GitHub and open [Actions → CI](https://github.com/allgemeiner-intellekt/Recito/actions/workflows/ci.yml).
2. Select a successful run for the `main` branch. To request a fresh build, click **Run workflow**, select `main`, and wait for it to finish.
3. Under **Artifacts**, download **recito-chrome**. Build artifacts are retained for 30 days. Builds also run automatically for pushes and pull requests to `main`.
4. Extract the downloaded ZIP into a folder you will keep on your computer.
5. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the extracted folder containing `manifest.json`.

To update, replace the contents of that folder with a newer cloud build and click **Reload** on the extension in `chrome://extensions`.

### Quick Updates in Brave on macOS

If Brave already loads this repository's `dist` folder, keep that installation. The updater downloads a cloud build into the same folder, so you can keep your existing extension ID and settings without reinstalling or compiling locally.

1. Install [GitHub CLI](https://cli.github.com) and sign in once with `gh auth login --hostname github.com`.
2. Double-click [`update-extension.command`](./update-extension.command) in Finder, or run `./update-extension.command` in a terminal.
3. When the download finishes, the script opens `brave://extensions`. Click **Reload** on Recito, then refresh any pages where you use it.

The updater selects the latest successful `main` CI run triggered by a push or a manual run. Pull-request preview builds are excluded. It downloads and checks the new build before replacing `dist`; a failed download leaves your installed files untouched. If the artifact has expired or is missing, request a fresh build with **Run workflow** in Actions. Updating does not require `git pull`, npm, or Node.js.

For a first install, run the updater, then use **Load unpacked** in `brave://extensions` to select this repository's `dist` folder. Keep that path fixed and use **Reload** for later updates.

Unpacked installations still need the browser's **Reload** step. Browser-managed automatic updates are available through a Chrome Web Store installation once the extension is published there.

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
