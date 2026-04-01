# Plan 00: Project Scaffold & Build Pipeline

**Estimated effort:** 1–2 days
**Depends on:** Nothing
**Unlocks:** All subsequent plans

## Objective

Set up the Chrome extension monorepo with Manifest V3, TypeScript, React 18, Vite, and a working dev/build/reload workflow. After this plan, you can `npm run dev` and load an unpacked extension that renders a blank popup.

## Tasks

1. **Initialize monorepo structure**
   ```
   /extension
     /src
       /background      — service worker entry
       /content          — content script entry
       /popup            — React popup app
       /options          — React options/settings page
       /offscreen        — offscreen document for audio
       /providers        — provider adapter interfaces & implementations
       /lib              — shared utilities (storage, messaging, types)
     /public
       manifest.json
       icons/
     vite.config.ts
     tsconfig.json
   /docs
   /examples
   ```

2. **Configure tooling**
   - TypeScript 5.x with strict mode
   - Vite with `@crxjs/vite-plugin` or `vite-plugin-chrome-extension` for hot-reload
   - React 18 for popup and options pages
   - ESLint + Prettier
   - Package manager: pnpm (or npm — pick one)

3. **Create Manifest V3 skeleton**
   - Permissions: `storage`, `activeTab`, `scripting`, `offscreen`
   - Service worker registration
   - Content script declaration (matches `<all_urls>`)
   - Popup and options page entries
   - Strict CSP: no `eval()`, no inline scripts

4. **Stub entry points**
   - `background/index.ts` — logs "service worker loaded"
   - `content/index.ts` — logs "content script injected"
   - `popup/App.tsx` — renders "Immersive Reader" placeholder
   - `options/App.tsx` — renders "Settings" placeholder
   - `offscreen/index.html` + `offscreen/index.ts` — empty offscreen doc

5. **CI foundation**
   - GitHub Actions workflow: lint, type-check, build on every PR
   - `.gitignore` for `node_modules`, `dist/`

## Exit Criteria

- [ ] `npm run build` produces a `dist/` folder loadable as unpacked extension in Chrome
- [ ] `npm run dev` starts a dev server with hot-reload for popup/options
- [ ] Clicking the extension icon shows the popup with placeholder text
- [ ] Service worker and content script both log to console on page load
- [ ] `npm run lint` and `npm run typecheck` pass with zero errors
- [ ] CI workflow runs green on a test PR

## Deliverables

- Working monorepo with all entry points stubbed
- `manifest.json` with correct MV3 permissions
- Dev + production build configurations
- CI pipeline (GitHub Actions)
