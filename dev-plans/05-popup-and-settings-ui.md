# Plan 05: Popup UI & Settings Page

**Estimated effort:** 4–5 days
**Depends on:** Plan 01 (storage layer), Plan 03 (transport API)
**Unlocks:** Onboarding flow (Plan 07)

## Objective

Build the extension popup (primary control surface) and the full-page settings/options page. After this plan, users can manage providers, configure voices, adjust settings, and control playback — all from polished UI surfaces.

## Tasks

### 1. Popup UI (`/src/popup/`) — 360 × 520 px

Layout (top to bottom, per PRD §5.1):

- **Header bar**: Logo + "Immersive Reader" + version. Right: gear icon → opens settings page.
- **Provider selector**: Pill-style toggle showing active provider + voice (e.g., "OpenAI · alloy"). Click opens dropdown of all configured providers. Selecting one calls `SET_ACTIVE_PROVIDER`.
- **Transport controls** (centered, large targets ≥ 44px):
  - `[◀◀ -Sentence]` `[◀ -10s]` `[▶ Play / ⏸ Pause]` `[▶ +10s]` `[▶▶ +Sentence]`
- **Speed rail**: Horizontal slider + step buttons (– / +). Current speed shown bold (14pt).
- **Volume row**: Speaker icon + slider (0–100%).
- **Current page info**: Favicon + truncated page title + reading progress bar (thin, accent color).
- **Queue badge**: "Queue: N items" + button to open queue panel (disabled until Plan 08).
- **Footer**: "Read Selection" shortcut reminder + keyboard shortcut chip.

Design tokens:
- Background: white
- Primary: `#23446E`
- Accent: `#257AFF`
- All interactive elements: `:focus-visible` outlines

### 2. Settings / Options page (`/src/options/`)

Two-column layout: left sidebar nav, right content panel.

**Sidebar sections:**

#### a. Providers
- List all configured providers as cards
- Each card: provider logo/icon, name, masked API key (last 4 chars), base URL, active voice, "Test Connection" button
- "Add Provider" button opens a form:
  - Provider type dropdown (OpenAI, ElevenLabs, Groq, Custom)
  - Name (user label)
  - API Key input (password field, show/hide toggle)
  - Base URL (pre-filled per provider, editable)
  - "Validate & Save" button — calls `validateKey()`, shows success/error
- Edit / Delete actions per card
- Support multiple keys per provider

#### b. Voices
- Per-provider voice list (fetched live via `listVoices()`)
- Display: name, language, gender (where available)
- "Preview" button (plays 5-second sample — stretch goal, mark as P2)
- Set default voice per provider
- Sort/filter by language

#### c. Playback
- Default speed selector
- Default volume
- Look-ahead buffer size (2–5 chunks)
- Auto-scroll toggle
- Skip references toggle (placeholder — actual logic in Plan 08)
- Sleep timer default (placeholder)

#### d. Highlighting
- Word highlight color picker (default: `#FFEB3B`)
- Sentence highlight color picker (default: `#E3F0FF`)
- Toggle word/sentence highlight independently
- Font overlay settings (placeholder for Plan 08: typeface, size boost)

#### e. Hotkeys
- List of all keyboard shortcuts with current bindings
- Rebind UI: click a shortcut → press new key combo → save
- Conflict detection with Chrome defaults

#### f. Advanced
- Custom CSS selector per domain (add/edit/remove rules)
- TLS verification toggle (for self-signed local endpoints)
- Debug log export button
- "Reset to Defaults" button per section + global reset

### 3. Shared UI components (`/src/lib/ui/`)

- `Button`, `Slider`, `Dropdown`, `Toggle`, `ColorPicker`, `KeyInput`
- Consistent styling via CSS modules or Tailwind (pick one)
- All components meet WCAG 2.1 AA

### 4. State management

- Popup reads playback state via `GET_STATE` message to service worker
- Popup reads provider/settings state from `chrome.storage.local`
- Settings page uses React state + `chrome.storage.local` for persistence
- Changes in settings page are immediately reflected in popup (via storage `onChanged` listener)

## Exit Criteria

- [ ] Popup renders all sections per the layout spec
- [ ] Provider selector shows all configured providers and switches active provider
- [ ] Transport controls in popup drive playback (play, pause, skip, speed, volume)
- [ ] Speed and volume changes persist across popup open/close
- [ ] Settings page: can add a new provider with API key, validate, and save
- [ ] Settings page: can edit and delete existing providers
- [ ] Settings page: voice list loads dynamically for each provider
- [ ] Settings page: playback, highlighting, and hotkey settings persist correctly
- [ ] Settings page: "Reset to Defaults" works per section
- [ ] API keys are never rendered in full in any DOM element (masked)
- [ ] All interactive elements are keyboard-accessible with focus outlines
- [ ] Changes in settings are reflected in popup without manual refresh

## Deliverables

- Popup React app with full layout
- Options/Settings page with all 6 sections
- Shared UI component library
- Storage ↔ UI sync via `chrome.storage.onChanged`
