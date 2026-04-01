# Talkify — DOM Walking Review

## Architecture Sketch

Two distinct modules:

**`talkify.textextractor`** — DOM → ordered list of "speakable" elements
- `extract(rootSelector, exclusions)` → returns visible DOM nodes with text
- Walks top-level children of `rootSelector`, recurses via `evaluate(nodes)`
- Pushes `<p>`, `<h1>`–`<h6>` directly as atomic units
- Groups consecutive inline elements (`<a>`, `<span>`, `<b>`, etc.) into a synthetic `<span class="superbar">`
- Wraps bare text nodes in `<span class="foobar">` (mutates DOM in place)
- Filters invisible elements via `element.offsetWidth || element.offsetHeight || element.getClientRects().length`

**`talkify.wordHighlighter`** — word/sentence highlight renderer
- Pub/sub based via `talkify.messageHub` with a `correlationId` per player instance
- Receives `{ Position: msFromStart, Word: 'word', CharPosition: charOffset }` arrays from provider
- On `timeupdated`: linear scan through positions array to find current word
- Calls `highlight(item, word, charPosition)` which:
  1. `findTextAndElementPairs()` — TreeWalker across the element's subtree → `[{ text, element }]` mappings
  2. `findCurrentSentence()` — simple regex split on `.?!。` to find sentence boundaries
  3. `highlightSentence()` — wraps sentence span with `<span class="talkify-sentence-highlight">`
  4. `highlightWord()` — wraps word with `<span class="talkify-word-highlight">`
  5. All via `replaceHtmlOn()` which does `node.parentNode.replaceChild` for text nodes, `innerHTML` for elements

## Reusable Patterns

**`findTextAndElementPairs()` — the key algorithm (adapt this):**
```js
// Uses document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
// Returns flat array of { text: string, element: TextNode|Element }
// Handles: whitespace trimming at boundaries, IMG alt text injection
// Result: flattened linear text map to DOM nodes, enabling char-offset → node lookup
```

**`findCurrentSentence()` heuristic:**
```js
// Split text on /[.?!。](?!\S)/g (sentence-ending punctuation not followed by non-space)
// Concatenates back with "." to handle abbreviations somewhat
// Returns { start: charOffset, end: charOffset } within the element's text
// Simple but catches most cases; misses "e.g.", "Dr.", "U.S.A." etc.
```

**`highlightWord()` char-position approach:**
```js
// Walks mappings accumulating character counts
// When charPosition falls within a mapping's range, calculates localPosition
// Injects <span> by splitting innerHTML: part1 + <span>word</span> + part2
// Clean: handles text spanning across multiple child nodes
```

**Forbidden element list** (copy this):
```js
['map', 'object', 'script', 'button', 'input', 'select', 'textarea', 'style', 'code', 'nav', '#nav', '#navigation', '.nav', '.navigation', 'footer', 'rp', 'rt']
```

**Inline element list** (copy this):
```js
['a', 'span', 'b', 'big', 'i', 'small', 'tt', 'abbr', 'acronym', 'cite', 'code', 'dfn', 'em', 'kbd', 'strong', 'samp', 'var', 'bdo', 'q', 'sub', 'sup', 'label']
```

## Gotchas

1. **innerHTML mutation on every word** — `highlightWord()` and `highlightSentence()` both do `element.innerHTML = newHtml` on every timeupdate tick. `resetCurrentItem()` restores original innerHTML before each highlight. This triggers reflow/repaint on every word boundary. On long documents this is O(n) DOM churn per word.

2. **`findCurrentSentence()` linear scan** — `split()` + loop on every highlight call. For a 5000-char element, this is cheap enough, but should be pre-computed once per TTS segment rather than per timeupdate.

3. **TreeWalker re-created each `highlight()` call** — `findTextAndElementPairs()` builds a fresh TreeWalker on every call. Should be cached after DOM mutation stabilizes.

4. **DOM mutation in `extract()`** — `textextractor` wraps bare text nodes in `<span>` elements. This permanently mutates the page DOM. Side effects: may break site-specific CSS selectors that target text nodes directly.

5. **No shadow DOM awareness** — `document.querySelectorAll` in `extract()` won't pierce shadow roots. Content in shadow DOM (e.g., web components) is silently skipped.

6. **Position data format tied to provider** — word timing `{ Position, Word, CharPosition }` is Talkify's own format. For OpenAI `verbose_json` or ElevenLabs timestamps, we'd need an adapter layer to normalize to this schema.

7. **Inline grouping creates synthetic DOM nodes** — the `group()` function clones inline siblings into a new `<span>`. The original nodes are removed. This can break event listeners attached to the original elements.

## Decision

**Adapt code** — specifically `findTextAndElementPairs()` (the TreeWalker text-map approach) and the inline/forbidden element lists. These are battle-tested.

Do NOT copy the `innerHTML` mutation approach for highlighting — use CSS Custom Highlight API or Range-based highlighting instead to avoid reflows. Do NOT copy the DOM-mutating `extract()` approach — scan without mutating, build a shadow mapping instead.
