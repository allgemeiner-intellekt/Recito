# Plan 06: Word & Sentence Highlighting

**Estimated effort:** 3–4 days
**Depends on:** Plan 02 (DOM mapping), Plan 03 (word timing), Plan 04 (toolbar/content script)
**Unlocks:** End-to-end v1.0 experience

## Objective

Implement real-time word-level and sentence-level highlighting that tracks playback progress in the page. Words light up as they're spoken; the full sentence is softly highlighted. Auto-scroll keeps the current sentence in view. After this plan, users get the full "karaoke-style" reading experience.

## Tasks

### 1. Highlight manager (`/src/content/highlight/manager.ts`)

- Receives word-timing events from the service worker (via `chrome.runtime.onMessage`)
- Maintains two highlight layers:
  - **Word highlight**: wraps the current word in a `<mark>` element (or uses CSS `::highlight` if supported)
  - **Sentence highlight**: wraps the entire current sentence
- Uses the DOM position data from Plan 02's `TextChunk` to locate exact nodes
- Cleans up previous highlights before applying new ones (no stale marks)

### 2. Highlight rendering strategy

- **Approach A (preferred)**: CSS Custom Highlight API (`CSS.highlights`)
  - Create `Range` objects for word and sentence
  - Register as named highlights: `word-highlight`, `sentence-highlight`
  - Style via `::highlight(word-highlight)` and `::highlight(sentence-highlight)`
  - Advantage: no DOM mutation, no layout reflow
  - Fallback: if browser doesn't support Custom Highlight API

- **Approach B (fallback)**: DOM wrapping
  - Wrap word in `<mark class="ir-word">` and sentence in `<mark class="ir-sentence">`
  - Must handle splitting text nodes and re-joining on highlight change
  - Be careful not to break page layout or event listeners

- Inject highlight styles into page via `<style>` tag in document head:
  ```css
  ::highlight(word-highlight) {
    background-color: var(--ir-word-color, #FFEB3B);
    color: black;
  }
  ::highlight(sentence-highlight) {
    background-color: var(--ir-sentence-color, #E3F0FF);
  }
  ```

### 3. Configurable colors

- Read highlight colors from `chrome.storage.local` (set in Settings page)
- Apply as CSS custom properties on the injected `<style>`
- Support toggling word and sentence highlights independently
- Update colors in real-time when user changes settings (storage `onChanged`)

### 4. Auto-scroll (`/src/content/highlight/auto-scroll.ts`)

- When a new sentence begins, check if it's in the viewport
- If not visible, `scrollIntoView({ behavior: 'smooth', block: 'center' })`
- Respect user's manual scroll: if user scrolls away, pause auto-scroll
  - Resume auto-scroll when next sentence starts (or after 5s timeout)
- Auto-scroll can be toggled on/off from settings

### 5. Cleanup

- On playback stop: remove all highlights and injected styles
- On page navigation: clean up via `beforeunload` handler
- On extension disable: content script cleanup runs

### 6. Edge cases & testing

- Test with pages that have:
  - Complex nesting (`<p><strong><em>word</em></strong></p>`)
  - Text inside `<a>`, `<code>`, `<li>` elements
  - RTL text
  - Very long paragraphs (100+ words)
  - Dynamic content (SPA page changes)
- Verify no layout shift or CLS issues from highlighting
- Verify page interactive elements (links, buttons) still work when highlighted

## Exit Criteria

- [ ] Current word is highlighted in real-time as audio plays (< 50ms latency from audio)
- [ ] Current sentence is highlighted with a softer background color
- [ ] Highlights move smoothly from word to word, sentence to sentence
- [ ] No stale highlights remain after moving to next chunk
- [ ] Highlight colors are configurable and update in real-time from settings
- [ ] Word and sentence highlights can be toggled independently
- [ ] Auto-scroll keeps current sentence in view
- [ ] Auto-scroll pauses when user manually scrolls
- [ ] No layout reflow or cumulative layout shift caused by highlights
- [ ] Highlights are fully cleaned up when playback stops
- [ ] Works correctly on 10+ test pages with varied DOM structures

## Deliverables

- Highlight manager with CSS Custom Highlight API (+ DOM fallback)
- Configurable highlight colors via CSS custom properties
- Auto-scroll with manual-scroll detection
- Cleanup handlers
- Edge case test suite
