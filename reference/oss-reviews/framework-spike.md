# Framework Decision: Plasmo vs WXT vs CRXJS

> Research date: 2026-03-29
> Context: Immersive Reader — open-source Speechify clone with BYOK support.
> Critical requirement: inject an isolated React UI overlay into arbitrary third-party pages via Shadow DOM.

---

## Summary Table

| Criterion | Plasmo | WXT | CRXJS |
|---|---|---|---|
| **Shadow DOM content script UI** | Built-in (CSUI) — first-class | Built-in (`createShadowRootUi`) — first-class | Manual — no helper, DIY only |
| **React + TypeScript** | First-class (React-centric) | First-class (framework-agnostic, React well-supported) | First-class (Vite-native) |
| **Build tool** | Custom Parcel fork | Vite | Vite plugin |
| **MV3 offscreen document** | Documented, supported | Supported via `defineOffscreenDocument` entrypoint | No built-in abstraction, manual manifest entry |
| **HMR quality** | Good for React, ~200 ms, sometimes requires manual refresh | Excellent across all script types, <100 ms | Excellent for content scripts and popup, <100 ms |
| **Bundle size overhead** | Moderate (Parcel, no efficient tree-shaking) | Minimal (Vite + Rollup, efficient tree-shaking) | Minimal (pure Vite) |
| **Escape hatch / eject** | Limited — Parcel config is proprietary; hard to diverge | Good — standard `wxt.config.ts` wraps Vite config; full Vite plugin ecosystem accessible | Excellent — it IS a Vite plugin; zero lock-in |
| **Firefox MV3 support** | Yes (Chrome, Firefox, Edge) | Yes (defaults to MV2 for Firefox, MV3 opt-in; best cross-browser story) | No — Chromium only |
| **Maintenance (as of 2026-03)** | Declining — community asks if abandoned (issue #1345, Feb 2026); lagging Parcel versions; React 19 not yet supported | Active — regular releases; v1.0 shipped late 2024; responsive maintainer | Declining — core author (@jacksteamdev) effectively dormant; community maintainer (Toumash) keeping it working but no stable release since 2022 |
| **GitHub stars** | ~13 k | ~9.5 k | ~4 k |

---

## Per-Framework Analysis

### Plasmo

**Build tool:** Plasmo uses a custom internal fork of Parcel (`@plasmohq/parcel-core`). There is a community issue (#1302, Jul 2025) requesting migration to Vite; no official plans exist as of March 2026. Parcel's zero-config design means the build is opaque — you cannot easily add arbitrary Vite plugins or inspect the graph. Cold builds run ~4 s vs ~2 s for Vite-based tools. HMR averages ~200 ms.

**Shadow DOM content script UI (CSUI):** Plasmo's flagship feature. The `contents/` directory follows a file-based convention where exporting a React component plus optional `getStyle` / `getShadowHostId` hooks is sufficient. Plasmo wraps the component in a shadow host automatically, injects a CSS reset, and manages lifecycle (mount, update, unmount). This is the most ergonomic Shadow DOM story of the three — it is the reason many teams choose Plasmo.

**React + TypeScript:** First-class. Plasmo was built React-first; Vue/Svelte support exists but is secondary. TypeScript enabled by default in project scaffolding.

**MV3 offscreen document:** Documented in Plasmo's workflow guides. Developers create `background/offscreen.ts` and call `chrome.offscreen.*` APIs directly; Plasmo does not abstract offscreen management further than manifest generation.

**Firefox MV3:** Supported for Chrome, Firefox, and Edge. Firefox messaging issues (connection errors in MV3 production builds) have been reported in the community, with workarounds available.

**Escape hatch / eject:** Weak. Because the build is driven by a proprietary Parcel fork, customizing the pipeline requires patching internal packages or working around config constraints. Users report conflicts with Storybook, Vitest, and TailwindCSS v4. No official eject path.

**Maintenance concerns (critical red flag):**
- Issue #1345 (Feb 2026): "Is it ready to continue maintenance?" — 4 thumbs up, 15 watchers, no response from maintainers.
- Issue #1280 (May 2025): Install fails due to missing `@plasmohq/parcel-core@0.1.11`.
- Issue #1216 (Mar 2025): React 19 not yet supported.
- Issue #1302 (Jul 2025): Migration to Vite requested; labeled "documentation" with no roadmap.
- Multiple analyses (Sep 2025, Jan 2026) describe Plasmo as "in maintenance mode" with "lagging major versions behind Parcel."
- The community consistently redirects users to WXT.

**Bundle size:** Moderate. Tree-shaking is notably broken in some configurations (issue #997: "Tree shaking not working"). Dev builds can reach 61 MB; production builds are more reasonable but larger than WXT equivalents.

**Summary verdict for Immersive Reader:** Shadow DOM story is best-in-class, but the Parcel build tool is a blocker for a project that wants Vite. Maintenance trajectory is concerning for a greenfield project.

---

### WXT

**Build tool:** Vite — specifically WXT wraps Vite with extension-aware defaults. `wxt.config.ts` extends the standard Vite config; any Vite plugin (e.g., `@vitejs/plugin-react`, `tailwindcss`) works directly. Cold builds ~2 s; HMR <100 ms across all entrypoint types including background service workers.

**Shadow DOM content script UI:** First-class via `createShadowRootUi(ctx, options)`. The function:
1. Creates a custom element as the shadow host.
2. Attaches a `ShadowRoot` (open mode by default; closed mode available).
3. Fetches and injects the content script's compiled CSS into the shadow root via a network call (hence async).
4. Exposes `onMount(container)` and `onRemove()` callbacks where you call `ReactDOM.createRoot(container).render(<App />)`.
5. Supports optional `isolateEvents: true` to stop events from propagating past the shadow boundary.

The React example in official docs is explicit and complete. Known issue #1536 (Mar 2025): CSS not taking effect in shadow DOM — resolved by ensuring `cssInjectionMode: 'ui'` is set. Issue #1658 (May 2025): Ant Design CSS not loading with Shadow Root UI — component library compatibility gotcha.

Three UI strategies available with trade-off table:

| Method | Isolated Styles | Isolated Events | HMR |
|---|---|---|---|
| Integrated | No | No | No |
| Shadow Root | Yes | Yes (opt-in) | No |
| IFrame | Yes | Yes | Yes |

Note: Shadow Root UI does not support HMR in the shadow root itself (HMR on popup/options pages is full). For content scripts, code changes trigger a content script reload.

**React + TypeScript:** First-class. Project scaffolding offers React template. TypeScript by default with auto-generated type declarations for the `wxt` module.

**MV3 offscreen document:** Supported via a dedicated entrypoint type `defineOffscreenDocument` (added in WXT v0.18+). Developers create `entrypoints/offscreen.html` (or similarly named) and the framework handles manifest generation and `chrome.offscreen.*` lifecycle. This is the cleanest offscreen abstraction of the three frameworks.

**Firefox MV3:** WXT defaults to MV2 for Firefox builds for maximum compatibility (Firefox MV3 support is maturing). Developers can opt into Firefox MV3 explicitly. The `webextension-polyfill` is included by default, providing a unified `browser` API across Chrome and Firefox. Chrome-only target can disable the polyfill via `extensionApi: 'chrome'` to reduce bundle size.

**Escape hatch / eject:** Good. The build system is standard Vite under a thin WXT wrapper. Any Vite plugin can be added via the `vite()` hook in `wxt.config.ts`. WXT provides migration guides (from CRXJS, from Plasmo). No formal "eject" but the standard Vite config is fully exposed.

**Maintenance:** Actively maintained as of March 2026. v1.0 shipped in late 2024, providing API stability. Regular commits; responsive maintainer (aklinker1). Community endorsement in CRXJS discussions: "WXT is the current best way to build extensions for sure." Multiple 2025–2026 review articles name WXT the recommended default.

**Bundle size:** Smallest among the three. Vite's Rollup-based production bundler performs efficient tree-shaking. The `webextension-polyfill` (~10 kB gzip) is included by default for cross-browser builds; Chrome-only builds can opt out.

**Auto-imports:** Nuxt-like auto-imports for WXT's own utilities (`defineContentScript`, `createShadowRootUi`, etc.) — no explicit import needed in entrypoint files. This reduces boilerplate without adding magic at the user-code level.

**Summary verdict for Immersive Reader:** Matches every criterion. Vite-native, first-class Shadow DOM UI helper, clean offscreen document support, active maintenance, and the best escape hatch story of the three.

---

### CRXJS

**Build tool:** A Vite plugin (`@crxjs/vite-plugin`) — not a framework. You start from a standard Vite project and add the plugin; the standard `manifest.json` drives entrypoint discovery. This gives complete control over the Vite config.

**Shadow DOM content script UI:** No built-in support. CRXJS provides no Shadow DOM helper. Developers must write all shadow root setup manually (see community discussion #910, Oct 2024 — question about style isolation went unanswered for 6 months). The CRXJS maintainer community has acknowledged there are no plans to add this.

**React + TypeScript:** First-class via standard Vite. `@vitejs/plugin-react` works normally. TypeScript via `vite-plugin-dts` or project tsconfig.

**MV3 offscreen document:** No abstraction. Developers write the offscreen HTML entrypoint and call `chrome.offscreen.*` APIs manually. CRXJS will bundle the HTML page correctly via manifest `web_accessible_resources`, but there is no `defineOffscreenDocument` equivalent.

**Firefox MV3:** No Firefox support. CRXJS is Chromium-only (Chrome + Edge). This is a hard blocker for cross-browser projects.

**HMR quality:** Excellent for popup, options, and content scripts when the beta package is used (`@crxjs/vite-plugin@beta`). Content script HMR is the distinguishing strength — changes reload the content script without reloading the host page. However: the stable npm release (`1.0.14`) is pinned to `vite@^2.9.0`, causing peer dependency warnings on Vite 5/6. The beta package (no official semver) supports Vite 3–6 in practice.

**Escape hatch:** Effectively zero — it IS just a Vite plugin. Full Vite config control at all times.

**Maintenance (critical red flag):**
- Original author (@jacksteamdev) has been absent since 2022; no response to status inquiries.
- Community discussion #872 (Feb 2024): "Unmaintained?" — the author of the thread answered their own question in Feb 2025: "CRXJS will be achieved (unless someone steps up and maintains it themselves)."
- A community maintainer (Toumash) has kept the beta working through Vite 6, but no stable release has shipped.
- Issue #991 (Mar 2025): "Promote CRXJS Vite Plugin from Beta to Latest" — still open.
- The broader extension developer community has been migrating to WXT; WXT provides an official CRXJS migration guide.

**Bundle size:** Minimal — pure Vite with no framework overhead.

**Summary verdict for Immersive Reader:** The lack of Shadow DOM helpers, no Firefox support, and a clearly declining maintenance trajectory make CRXJS unsuitable as the primary framework for this project.

---

## inject-react-anywhere (if needed)

**Repository:** https://github.com/OlegWock/inject-react-anywhere
**Stars:** 58 (niche utility, single contributor)
**Last commit:** Oct 2024
**License:** MIT

### What it does

`inject-react-anywhere` is a small TypeScript library that wraps the full shadow DOM setup + React mounting pipeline into a two-function API: `createInjectableComponent` and `injectComponent`.

### Shadow root creation

`injectComponent` creates a `<div>` as the shadow host, calls `shadowHost.attachShadow({ mode: 'open' })` (or `{ mode: 'closed' }` when `useClosedShadow: true`), then appends two `<div>` nodes inside: one as the React mount target (`mountedInto`) and one as the style wrapper (`stylesWrapper`).

### React mounting

Supports both legacy React 17 (`ReactDOM.render`) and React 18 (`createRoot`) via the `mountStrategy` option:

```ts
import v18 from 'inject-react-anywhere/v18';

const controller = await injectComponent(InjectableGreeter, props, {
  mountStrategy: v18,
});
document.body.append(controller.shadowHost);
```

The returned `controller` object exposes: `shadowHost`, `shadowRoot`, `mountedInto`, `updateProps(partial)`, `unmount()`, and `connectPortal()`.

### CSS-in-JS isolation technique

The library ships adapters for three strategies:

1. **CSS strings** (`stringStyles`): injects a `<style>` tag into the shadow root.
2. **styled-components** (`inject-react-anywhere/styled-components`): wraps `StyleSheetManager` with `target` pointing to the `stylesWrapper` div inside the shadow root, so styled-components injects into the shadow DOM rather than `<head>`.
3. **Emotion** (`inject-react-anywhere/emotion`): similar — uses Emotion's cache with `container` set to `stylesWrapper`.

Custom `StylesInjector` functions can be written for other CSS-in-JS libraries. The `StylesInjector` signature:

```ts
type StylesInjector = <P>(
  Component: ComponentType<P>,
  shadowHost: HTMLElement,
  shadowRoot: ShadowRoot,
  mountingInto: HTMLDivElement,
  stylesWrapper: HTMLDivElement
) => ComponentType<P>;
```

A CSS reset is injected by default (`includeCssReset: true`). This prevents host-page global styles (e.g., `html { font-size: 62.5% }`) from bleeding into the shadow root via rem units — the same bug documented in CRXJS discussion #910.

### Event propagation gotchas

Shadow DOM events do not bubble across the shadow boundary by default. The `isolateEvents` option (in WXT's `createShadowRootUi`) addresses this. In `inject-react-anywhere`, events are not specially handled — React synthetic events inside the shadow root fire normally within the tree, but native DOM events (e.g., `click`, `keydown`) dispatched from within the shadow root do not bubble to `document`. If the extension's background or popup listens on `document` for user events, a proxy event or `composed: true` on custom events is needed.

The library's `useShadowDom` hook and `withShadowDom` HOC expose `shadowRoot` and `shadowHost` to any component in the tree, enabling components to dispatch composed events or attach listeners as needed.

### When to use it

This library is only relevant if the chosen framework has **no built-in shadow DOM helpers**. Given WXT's `createShadowRootUi` covers all the same ground natively (and is maintained as part of the framework), `inject-react-anywhere` is not needed with WXT.

---

## Recommendation

### Decision: WXT

**Rationale:**

WXT is the only framework that simultaneously satisfies all four of the project's hard requirements: (1) built-in `createShadowRootUi` for isolated React overlay injection, (2) Vite as the native build tool with full plugin access, (3) first-class MV3 service worker + offscreen document + content script architecture via typed `defineOffscreenDocument` and `defineContentScript` entrypoints, and (4) minimal magic — the build is standard Vite under a thin wrapper, debuggable with standard browser devtools and Vite introspection. Plasmo's Shadow DOM support is marginally more ergonomic, but its Parcel build tool is a direct conflict with the project's Vite preference and its maintenance trajectory is a serious risk for a greenfield codebase. CRXJS is eliminated by lack of Shadow DOM helpers, no Firefox support, and a dormant upstream.

- **Decision:** WXT
- **Rationale:** WXT offers built-in shadow DOM content script UI (`createShadowRootUi`), is fully Vite-based, has clean offscreen document entrypoint support, and is the most actively maintained of the three frameworks as of early 2026. Its escape hatch is excellent — the full Vite config is accessible at all times, and the framework has an official migration guide from CRXJS. Plasmo's CSUI is compelling but its Parcel build and declining maintenance make it a long-term liability. CRXJS is effectively unmaintained and Chrome-only.
- **inject-react-anywhere needed:** No. WXT's `createShadowRootUi` provides equivalent functionality — shadow host creation, CSS injection into the shadow root, React mount/unmount lifecycle, and optional event isolation — within the framework itself. `inject-react-anywhere` would only be considered as a fallback if WXT's helper proves insufficient for a specific edge case (e.g., dynamic portal injection into nested shadow roots), in which case the library's `connectPortal` / `createShadowPortal` API handles that scenario.
