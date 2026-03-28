# Plan 04: Floating Reader Toolbar

**Estimated effort:** 3–4 days
**Depends on:** Plan 03 (audio pipeline)
**Unlocks:** Plan 06 (highlighting — shares content script injection)

## Objective

Build the floating toolbar that appears at the bottom of the page during playback. It provides transport controls, speed adjustment, and a progress indicator — all injected into the page via Shadow DOM for style isolation. After this plan, users can control playback entirely from the in-page toolbar.

## Tasks

### 1. Shadow DOM injection (`/src/content/toolbar/mount.ts`)

- Create a container `<div>` appended to `document.body`
- Attach a closed Shadow DOM to isolate styles from the host page
- Set `z-index: 2147483646` (max – 1)
- Mount a React root inside the shadow DOM for the toolbar UI
- Inject toolbar-specific CSS into the shadow root (no leakage)

### 2. Toolbar component (`/src/content/toolbar/Toolbar.tsx`)

- **Collapsed state** (default, ~320px wide):
  - Play/Pause button (large, ≥ 44px touch target)
  - Progress bar (thin, shows % of total chunks completed)
  - Speed chip (e.g., "1.5×") — click to cycle speeds
  - Close × button
  - Chevron to expand

- **Expanded state**:
  - Full transport: `[◀◀ -Sentence]` `[◀ -10s]` `[▶/⏸]` `[▶ +10s]` `[▶▶ +Sentence]`
  - Volume slider
  - Voice/provider selector dropdown
  - Chevron to collapse

- **Styling**:
  - Background: `#1A1A2E` at 92% opacity with `backdrop-filter: blur(12px)`
  - Text: white
  - Accent: `#257AFF`
  - Position: `fixed`, `bottom: 16px`, centered horizontally
  - Draggable to any viewport edge (persist position per session)
  - Responsive: collapse further on narrow viewports (< 400px)

### 3. Toolbar state management

- Subscribe to playback state from the service worker via `chrome.runtime.onMessage`
- State drives UI: play/pause icon, progress %, current speed, active provider/voice
- Toolbar dispatches transport commands back to service worker
- Expand/collapse state stored in `sessionStorage` (resets per tab)

### 4. Show/hide logic

- **Show**: when playback starts (PLAYING state)
- **Hide**: when playback stops (IDLE state) or user clicks ×
- **Auto-hide**: if a `<video>` or `<audio>` element on the page starts playing, hide toolbar to avoid conflict
- Smooth entrance/exit animation (slide up from bottom, 200ms ease-out)

### 5. Drag behavior

- Mouse/touch drag on the toolbar header area
- Snap to bottom-center, bottom-left, bottom-right, or top-center
- Persist snap position in `chrome.storage.local` per domain (optional) or globally

### 6. Accessibility

- All buttons have `aria-label` attributes
- Keyboard navigable: Tab through controls, Enter/Space to activate
- `:focus-visible` outlines on all interactive elements
- High-contrast mode: toggle via toolbar settings (invert to light background)

## Exit Criteria

- [ ] Toolbar appears at page bottom when playback starts
- [ ] Toolbar disappears when playback stops or × is clicked
- [ ] Play/Pause, Skip Forward, Skip Back buttons work correctly
- [ ] Speed chip cycles through all speed options (0.5×–3×)
- [ ] Volume slider adjusts audio volume in real-time
- [ ] Progress bar accurately reflects playback progress
- [ ] Toolbar styles do NOT leak into or get affected by the host page (Shadow DOM isolation)
- [ ] Toolbar is fully keyboard-navigable with proper ARIA labels
- [ ] Toolbar is draggable and snaps to viewport edges
- [ ] Expand/collapse toggle works and state persists within session
- [ ] Toolbar auto-hides when page video/audio plays

## Deliverables

- Shadow DOM injection system for content script UI
- Floating toolbar React component (collapsed + expanded states)
- Toolbar ↔ service worker state sync
- Drag-and-snap behavior
- Show/hide/auto-hide logic
- Accessible controls with ARIA labels
