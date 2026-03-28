# Plan 07: Onboarding Flow & v1.0 Release

**Estimated effort:** 3–4 days
**Depends on:** Plans 00–06 (all core features complete)
**Unlocks:** Chrome Web Store submission, public launch

## Objective

Build the first-run onboarding experience, perform end-to-end QA across all features, write essential documentation, and submit to the Chrome Web Store. After this plan, v1.0 is live and usable by the public.

## Tasks

### 1. Onboarding flow (`/src/onboarding/`)

Three-step tab that opens on first install (per PRD §5.4):

**Step 1 — Welcome**
- Brief intro: "Listen to any web page with your own API keys"
- Key value props (3 bullets): BYOK, Privacy, Open Source
- Placeholder for explainer video thumbnail
- "Get Started" CTA button

**Step 2 — Add Your First Provider**
- Inline form: provider type dropdown → API key input → "Validate & Save"
- Direct links to each provider's API key page:
  - OpenAI: `platform.openai.com/api-keys`
  - ElevenLabs: `elevenlabs.io/app/settings/api-keys`
  - Groq: `console.groq.com/keys`
- On successful validation: auto-fetch voices, let user pick a default
- "Skip for now" link (goes to step 3 with a reminder)

**Step 3 — Try It Now**
- Opens a sample article page (bundled HTML or redirects to a known stable article)
- Auto-starts playback to demonstrate highlighting and controls
- Brief tooltip tour of the floating toolbar
- "You're all set!" with link to full settings

**Implementation:**
- Detect first install via `chrome.runtime.onInstalled` with `reason === 'install'`
- Open onboarding tab via `chrome.tabs.create()`
- Store `onboardingComplete: true` in `chrome.storage.local` to not re-show
- Re-accessible from Settings → Help → "Replay Onboarding"

### 2. End-to-end QA checklist

Test the complete flow on each of these page types:
- [ ] News article (e.g., BBC, NYT, Ars Technica)
- [ ] Blog post (Medium, Substack, personal blog)
- [ ] Documentation (MDN, React docs)
- [ ] Wikipedia article
- [ ] Stack Overflow question/answer
- [ ] GitHub README
- [ ] Google Docs (public view)
- [ ] Chrome PDF viewer

Test each provider:
- [ ] OpenAI TTS — full playback, speed control, word timing
- [ ] ElevenLabs — full playback, voice settings
- [ ] Groq — full playback, verify low latency
- [ ] Custom endpoint (local Ollama/kokoro-tts if available)

Test each feature:
- [ ] Play / Pause / Stop / Skip
- [ ] Speed changes during playback (all speeds)
- [ ] Volume control
- [ ] Word + sentence highlighting sync
- [ ] Auto-scroll
- [ ] Text selection → play selection only
- [ ] Provider switching mid-session
- [ ] Key validation success + failure states
- [ ] Popup UI: all controls responsive
- [ ] Floating toolbar: all controls, drag, expand/collapse
- [ ] Settings: all sections save and persist correctly
- [ ] Keyboard shortcuts (Space, arrows, +/-)
- [ ] Extension works after browser restart (settings persist)

### 3. Documentation

- **README.md**: Project overview, installation (dev + Chrome Web Store), usage, screenshots, contributing link
- **CONTRIBUTING.md**: How to add a new provider adapter (step-by-step, < 100 lines of TS)
- **SECURITY.md**: Responsible disclosure policy, how keys are stored
- **PROVIDERS.md**: Registry of supported providers with status
- **LICENSE**: MIT

### 4. Chrome Web Store preparation

- Extension icons: 16, 32, 48, 128 px
- Store listing: title, description (< 132 chars summary), detailed description, screenshots (1280×800), categories
- Privacy practices disclosure: "This extension stores API keys locally and does not collect any user data"
- Build reproducibility: `npm run build` produces deterministic output

### 5. Release

- Tag `v1.0.0` in git
- Create GitHub release with changelog
- Submit to Chrome Web Store
- Verify store listing renders correctly

## Exit Criteria

- [ ] Onboarding opens on first install and walks through all 3 steps
- [ ] Onboarding can be skipped and re-accessed from settings
- [ ] All QA checklist items pass (see section 2)
- [ ] README, CONTRIBUTING, SECURITY, and LICENSE files are complete
- [ ] Chrome Web Store submission is accepted (or at least submitted)
- [ ] `v1.0.0` tag exists in git with a release

## Deliverables

- Onboarding flow (3-step first-run experience)
- QA pass across all features, providers, and page types
- Project documentation (README, CONTRIBUTING, SECURITY, PROVIDERS, LICENSE)
- Chrome Web Store listing assets and submission
- Git tag `v1.0.0`
