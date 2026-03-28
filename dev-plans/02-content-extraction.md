# Plan 02: Content Extraction & Sentence Chunking

**Estimated effort:** 2–3 days
**Depends on:** Plan 00 (scaffold)
**Unlocks:** Plan 03 (audio pipeline), Plan 06 (highlighting)

## Objective

Build the content script module that extracts readable text from any web page, splits it into sentence-sized chunks suitable for TTS, and supports user text selection as an override. After this plan, the content script can extract and chunk text from Alexa Top 100 article pages with ≥ 95% accuracy.

## Tasks

### 1. Readability-based extraction (`/src/content/extractor.ts`)

- Integrate Mozilla's `@mozilla/readability` (or the `readability` npm package)
  - Clone the document, run Readability, get article `textContent` and DOM structure
- Fallback: if Readability fails (no article detected), extract from `document.body` with noise filtering
- **Noise filtering**: strip elements matching common selectors:
  - `nav`, `footer`, `header`, `aside`, `.cookie-banner`, `[role="banner"]`, `[role="navigation"]`, `[role="complementary"]`, `[aria-hidden="true"]`
  - Ad containers: `.ad`, `.advertisement`, `[data-ad]`, `iframe[src*="doubleclick"]`

### 2. Text selection support (`/src/content/selection.ts`)

- Listen for a trigger (keyboard shortcut or message from popup)
- If `window.getSelection()` is non-empty, use the selected text instead of full-page extraction
- Return both the text and the DOM range for highlighting

### 3. Sentence chunking (`/src/lib/chunker.ts`)

- Split extracted text into sentence-level chunks
- Use a rule-based sentence boundary detector:
  - Split on `.` `!` `?` followed by whitespace + uppercase letter
  - Handle abbreviations (Mr., Dr., U.S., etc.) — don't split on these
  - Handle quotes, parentheses, and ellipsis correctly
- Target chunk size: 15–25 words per sentence
  - If a sentence exceeds 50 words, split at the nearest clause boundary (comma, semicolon, em-dash)
  - If a sentence is under 5 words, merge with the next sentence
- Each chunk includes:
  ```typescript
  interface TextChunk {
    index: number;
    text: string;
    // DOM position info for highlighting
    startNode: Node;
    startOffset: number;
    endNode: Node;
    endOffset: number;
  }
  ```

### 4. DOM position mapping (`/src/content/dom-mapper.ts`)

- Walk the extracted DOM tree and map each chunk back to its exact DOM position
- This mapping is critical for Plan 06 (word/sentence highlighting)
- Use a TreeWalker to iterate text nodes and track character offsets
- Handle edge cases: text split across multiple `<span>`, `<em>`, `<strong>` elements

### 5. Content script orchestration (`/src/content/index.ts`)

- On receiving `EXTRACT_CONTENT` message from service worker:
  1. Check for text selection → use if present
  2. Otherwise run Readability extraction
  3. Chunk the result
  4. Store chunks in content script memory
  5. Reply with chunk count and metadata
- Expose `getChunk(index)` for the audio pipeline to request chunks one at a time

### 6. Tests

- Unit tests for sentence chunker with edge cases (abbreviations, quotes, long sentences)
- Integration tests: feed sample HTML pages through extractor → chunker pipeline
- Test at least 5 representative page types: news article, blog post, documentation, Wikipedia, Stack Overflow

## Exit Criteria

- [ ] Readability extraction correctly identifies article body on 10+ test pages
- [ ] Noise elements (nav, footer, ads) are excluded from output
- [ ] Sentence chunker produces chunks of 5–50 words with correct boundaries
- [ ] Abbreviations do not cause false splits
- [ ] Text selection override works and returns correct DOM ranges
- [ ] DOM position mapping correctly identifies start/end nodes for each chunk
- [ ] All unit and integration tests pass

## Deliverables

- Content extraction module (Readability + fallback)
- Sentence chunking algorithm with edge case handling
- DOM position mapper for highlighting support
- Text selection handler
- Test suite with sample HTML fixtures
