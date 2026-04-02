# Plan: Implement Remaining Gaps from Plans 00–07

## Context

All 8 agents audited Plans 00–07 against the live codebase. Core functionality is complete and working — the extension is fully usable. However, several planned features were skipped or partially implemented. This plan identifies what's **still worth doing** vs what should be cut as over-engineering.

## Audit Summary

| Plan | Status | Completion |
|------|--------|------------|
| 00 - Scaffold | Complete | 98% |
| 01 - Providers & Storage | Complete | 96% |
| 02 - Content Extraction | Complete | 95% |
| 03 - Audio Pipeline | Complete | 98% |
| 04 - Floating Toolbar | Complete | 93% |
| 05 - Popup & Settings | Complete | 85% |
| 06 - Highlighting | Complete | 95% |
| 07 - Onboarding & Release | Partial | 65% |

## Gaps Worth Implementing

### 1. Keyboard Shortcuts via `chrome.commands` (Plans 03/04)
**Why:** High-impact UX — users expect Space=play/pause, arrows=skip in a reader tool.
- Add `commands` to `manifest.config.ts` (Space, ArrowLeft, ArrowRight, +/-)
- Add `chrome.commands.onCommand` listener in `src/background/index.ts`
- Route to existing transport control handlers in `message-router.ts`

### 2. Fix Test Assertion Mismatch (Plan 01)
**Why:** CI should be green. Trivial fix.
- `src/providers/openai-compatible.test.ts`: change expected `input: "."` → `input: "test"` to match `custom.ts` line 88

### 3. Add Test Step to CI (Plan 00)
**Why:** Tests exist but CI doesn't run them. One-line fix.
- `.github/workflows/ci.yml`: add `npm run test` step

### 4. Fix Lint Warnings (Plan 01)
**Why:** Clean CI output. 10 unused imports + 1 useless escape.
- Remove unused imports across flagged files
- Fix regex escape in `src/content/extraction/sentence-splitter.ts:104`

### 5. Auto-hide Toolbar on Native Media (Plan 04)
**Why:** Prevents confusing overlap when page has its own video/audio player.
- In `src/content/index.tsx` or `FloatingToolbar.tsx`: listen for `play` events on `<video>`/`<audio>` elements
- Hide toolbar when native media plays, restore when it pauses/ends

### 6. "Replay Onboarding" in Settings (Plan 07)
**Why:** Low effort, useful for users who skipped setup.
- Add button in `src/options/Options.tsx` Advanced section
- Opens `chrome.runtime.getURL('src/onboarding/index.html')` in new tab

### 7. PROVIDERS.md Documentation (Plan 07)
**Why:** Planned deliverable, helps users choose a provider.
- Create `PROVIDERS.md` with provider comparison table (pricing, latency, quality, limits)
- Reference existing data from `src/providers/registry.ts`

### 8. Version Bump to 1.0.0 (Plan 07)
**Why:** Package.json still says `0.1.0`. Should reflect shipped state.
- Update `version` in `package.json`
- Create `v1.0.0` git tag

## Gaps Intentionally Cut

| Gap | Reason to Skip |
|-----|---------------|
| Integration tests with 5+ real HTML pages | Extensive effort, diminishing returns for extension context |
| E2E playback tests | Hard to automate in Chrome extension; manual testing sufficient |
| Voice preview button | P2 feature, complex (needs audio playback in options page) |
| Look-ahead buffer size setting | Users don't need this knob; current default (2) works well |
| Custom CSS selector per domain | Power-user feature, better suited for Plan 08/09 |
| TLS verification toggle | Niche use case (self-signed certs) |
| Debug log export | Niche; console.log sufficient for now |
| Per-section reset to defaults | Global reset is sufficient |
| Hotkey rebinding / conflict detection | Over-engineering for v1.0 |
| Step 3 sample article + auto-play demo | Complex, marginal onboarding benefit |
| sessionStorage for toolbar expand state | Trivial UX impact, resets on nav anyway |
| Voice selection during onboarding | Auto-select first voice is fine |
| docs/ and examples/ directories | Not needed until more contributors join |

## Implementation Order

Ordered by dependency and impact:

1. **Fix test + lint** (#2, #4) — unblock clean CI
2. **Add CI test step** (#3) — tests now run in pipeline
3. **Keyboard shortcuts** (#1) — highest UX impact
4. **Auto-hide on native media** (#5) — polish
5. **Replay onboarding button** (#6) — quick win
6. **PROVIDERS.md** (#7) — documentation
7. **Version bump + tag** (#8) — do last, marks completion

## Key Files to Modify

- `manifest.config.ts` — add `commands`
- `src/background/index.ts` — add `onCommand` listener
- `src/providers/openai-compatible.test.ts` — fix assertion
- `.github/workflows/ci.yml` — add test step
- `src/content/index.tsx` or `FloatingToolbar.tsx` — native media detection
- `src/options/Options.tsx` — replay onboarding button
- `package.json` — version bump
- Various files — remove unused imports

## Verification

1. `npm run test` — all tests pass (including fixed assertion)
2. `npm run lint` — zero warnings
3. `npm run typecheck` — zero errors
4. `npm run build` — clean build
5. Manual: load extension, press Space on a page → playback starts
6. Manual: play a YouTube video → toolbar auto-hides
7. Manual: Settings → Advanced → "Replay Onboarding" opens onboarding tab
