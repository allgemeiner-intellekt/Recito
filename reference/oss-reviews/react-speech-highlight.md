# react-speech-highlight — Highlighting Sync Review

Reviewed: 2026-03-29
Repo: https://github.com/albirrkarim/react-speech-highlight-demo (public demo/docs)
Package repo: private (paid, $900 one-time)
Version reviewed: v5.6.1 / v5.6.2
Stars: ~187 | License: proprietary (no OSS license)

---

## Architecture Sketch

### Text pre-processing: `markTheWords()`

Before any audio plays, the raw HTML/text string is passed through `markTheWords(text, abbreviationFn)`. This function walks the text and wraps every sentence in a `<sps>` tag and every word in a `<spw>` tag. The output is injected into the DOM via `dangerouslySetInnerHTML`. This is the **pre-bake step** — the DOM is fully annotated before playback starts.

```
raw text
  → markTheWords()
  → HTML string with <sps>/<spw> markers
  → dangerouslySetInnerHTML into a ref'd container div
  → DOM nodes with data-* or id attributes per word/sentence
```

### Timing acquisition: three modes

The config key `timestampDetectionMode` (or `timestampEngineProps.mode`) selects one of three engines:

1. **`"auto"` (hybrid)** — tries `"ml"` first, falls back to `"rule"`.
2. **`"ml"` (STT-based alignment)** — sends each audio chunk to OpenAI Whisper (`/v1/audio/transcriptions` with `response_format: verbose_json`). The Whisper response contains per-word `start`/`end` timestamps. The library then aligns those timestamps against the pre-known word list from `markTheWords()`. The internal function is called `sNodesSTTAlign()`. Accuracy reported in changelog: ~98% word-time accuracy, ~99.97% sentence-time accuracy over 722 samples, avg exec time 0.37 ms per chunk.
3. **`"rule"` (rule-based estimation)** — pure client-side fallback. Uses character counts and estimated speaking rate to compute approximate word boundaries. Does not require an STT call. Accuracy: ~84% word-time accuracy over 79 samples, 1.59 ms exec time per chunk. This is the fallback when no OpenAI API key is provided.

### Audio source pipeline

```
preferAudio(fn) → [call TTS API, get mp3 blob URL]
  or Web Speech Synthesis (window.speechSynthesis)
    or fallbackAudio(fn)
```

For external audio (ElevenLabs, OpenAI TTS, etc.) the library:
- Calls the user-supplied `preferAudio` async function with the text chunk (SSML-cleaned via `convertTextIntoClearTranscriptText()`)
- Receives a blob URL for the mp3
- Creates an `HTMLAudioElement`, loads the blob
- The timestamp engine runs **once per chunk** when the audio is ready, annotating all words in that chunk with `{ start, end }` seconds

OpenAI TTS is called with the plain audio endpoint (`/v1/audio/speech`), NOT `verbose_json` — the `verbose_json` is used by the separate **Whisper STT pass** to extract timing. There is no direct use of the OpenAI TTS `verbose_json` format because OpenAI TTS does not return timestamps in its audio response; instead the library does a second Whisper pass on the generated audio. ElevenLabs timestamps (alignment API) are not used either — same Whisper-based alignment approach is used uniformly across all providers.

### Highlight sync loop

Once timing data is available, the library listens to `audio.timeupdate` on the `HTMLAudioElement`. Inside the handler:
- It reads `audio.currentTime`
- Performs a lookup (likely binary search or linear scan) against the pre-computed word timestamp array
- Directly mutates the DOM: adds/removes CSS classes (`highlight-spoken`, `highlight-sentence`) on the `<spw>`/`<sps>` nodes
- **Does NOT call React setState** for highlighting — explicitly documented as intentional to avoid React re-renders ("Highlight animation without react rerender so the performance is fast")

For Web Speech Synthesis, it listens to the `SpeechSynthesisUtterance` `onboundary` event (charIndex/charLength), with documented fallbacks because `onboundary` is unreliable on iPad (~30% fire rate) and some voices don't fire it at all.

The `controlHL.followTime(currentTimeSeconds)` API (added v5.0.1) allows an external time source (e.g., a YouTube iframe's `currentTime`) to drive highlighting without any internal audio element.

### Batching for long documents

Text is split into chunks of `batchSize` characters (default 200). Audio is fetched and timestamp-detected chunk by chunk. Chunks ahead of the currently playing one are pre-fetched in the background while playback proceeds. This solves: (a) iOS/iPadOS 4-second gesture-to-play limit, (b) TTS API character limits (ElevenLabs: 5000 chars max per request), (c) user-perceived latency.

---

## Reusable Patterns

### 1. Pre-bake DOM annotation, not runtime wrapping

`markTheWords()` runs once before playback. By the time audio starts, every word already has a DOM node. The sync loop only toggles classes — no innerHTML rewrites, no new node creation during playback. This is the right approach; it avoids layout thrash completely during playback.

### 2. Direct DOM mutation instead of React state for highlight

The library bypasses React's render cycle entirely for highlight updates. The `timeupdate` event handler directly calls `element.classList.add/remove()`. This is the correct pattern for 60 fps word-by-word updates. Storing `currentTime` in React state causes >400 ms event handling under 6x CPU throttle (documented in community research; the library's own docs confirm the same approach).

### 3. Whisper STT as universal timing alignment layer

Rather than depending on provider-specific timestamp formats (OpenAI `verbose_json`, ElevenLabs alignment endpoint), the library uses a second Whisper pass on the generated audio blob. This is provider-agnostic and works for any TTS output. The tradeoff: extra API cost (one STT call per audio chunk) and latency.

### 4. Rule-based fallback estimation

When no STT is available, character-count-based timing estimation (~84% word accuracy) provides a degraded-but-functional experience. The library uses this as the automatic fallback in `"auto"` mode.

### 5. Batch + prefetch system

200-character chunks with lookahead prefetch is a concrete, proven pattern for balancing latency, iOS gesture constraints, and TTS API limits. The `batchSize: 200` default is tuned around ElevenLabs/OpenAI TTS response times.

### 6. `convertTextIntoClearTranscriptText()` as SSML normalization

Stripping HTML and normalizing text to a form that matches what the TTS will actually speak (so STT alignment stays accurate) is a non-obvious but important step. Abbreviation expansion (`noAbbreviation`, custom `abbreviationFunction`) is part of this pipeline.

### 7. CSS approach: DOM `<mark>`-equivalent wrapping, not CSS Custom Highlight API

The library uses explicit `<spw>` / `<sps>` wrapper tags injected by `markTheWords()`, styled via CSS classes toggled at runtime. It does **not** use the CSS Custom Highlight API (`CSS.highlights`, `Highlight` constructor, `::highlight()` pseudo-element). The wrapper-tag approach has wider browser support and avoids the experimental/partial implementation status of the CSS Custom Highlight API as of 2024-2025.

---

## Gotchas

### Source is closed / proprietary
The actual implementation source (the private repo) is not readable. All findings above are inferred from public docs, changelogs, type signatures, and demo code. The actual binary search / class toggle implementation, the full Whisper alignment algorithm, and the rule-based estimator internals are not auditable. The $900 price puts it out of scope as a dependency for an OSS project.

### No direct use of OpenAI TTS `verbose_json` or ElevenLabs alignment timestamps
The library does NOT use the `verbose_json` response format from OpenAI TTS (which does return word-level timestamps). Instead it does a second Whisper transcription of the audio. This adds cost and latency that could be avoided by consuming `verbose_json` directly from OpenAI TTS. For our project, we should use `verbose_json` natively and skip the double-API-call pattern.

### `timeupdate` fires at 4–66 Hz depending on browser
The library relies on `timeupdate` for sync. At the low end (4 Hz on some mobile browsers), highlight can lag up to 250 ms behind audio. The library doesn't appear to use `requestAnimationFrame` for tighter sync — no mention in any public doc. For fast speech rates this may produce visible lag.

### `onboundary` is deeply unreliable for Web Speech Synthesis
Documented problems: not fired on all voices, only ~30% of words on iPad, fires incorrectly for numbers (e.g., `"2022"` fires as `"20"` then `"22"`). The rule-based fallback handles this but at reduced accuracy.

### Long document performance: marking lag at render time
A commented-out note in PROBLEMS.md mentions: "when marking the word (more than 2400 sentences, 45700 words, 260500 characters) it gets slow when React UI renders (lag). After rendered it will be normal again." The `markTheWords()` call is inside `useMemo()` to mitigate re-runs, but the initial render of very large docs will block. For a Chrome extension reading arbitrary web pages this is a real risk.

### `dangerouslySetInnerHTML` dependency
The pattern requires replacing page content with library-annotated HTML. For a Chrome extension reading existing page DOM (not controlling the HTML), this approach needs significant adaptation — you cannot easily `dangerouslySetInnerHTML` over existing page content without potentially breaking event listeners, iframes, or shadow DOM.

### Reflow risk from pre-bake wrapping
Injecting `<spw>` spans around every word expands the DOM node count significantly. On a 10,000-word article this could add 10k+ new DOM nodes. Initial parse/layout will cause a reflow. Once rendered, subsequent class toggles are paint-only (no geometry change if spans are `display: inline`), so ongoing sync should be reflow-free.

### Proprietary SSML dependency
`convertTextIntoClearTranscriptText()` normalizes text to a format the library's own STT alignment expects. Without access to the source, we cannot replicate the exact normalization. This creates tight coupling to the library's internal format.

---

## Decision

**Take inspiration only — do not use as a dependency or adapt code.**

Reasons:
1. **Proprietary / closed source.** Not usable in an OSS Chrome extension project. The $900 license also explicitly prohibits sharing code with others.
2. **Wrong timing-data architecture for our use case.** The library deliberately avoids consuming provider timestamp responses (OpenAI TTS `verbose_json`, ElevenLabs alignment) and instead runs a second Whisper STT pass. We should consume `verbose_json` directly from OpenAI TTS — it's already in the API response, costs nothing extra, and is more accurate.
3. **DOM injection model doesn't fit Chrome extension context.** The library assumes it controls the rendered HTML (`dangerouslySetInnerHTML`). A Chrome extension reads existing page DOM, requiring a different annotation strategy (e.g., TreeWalker-based text node splitting, or CSS Custom Highlight API against `Range` objects).

Patterns to carry forward into our own implementation:
- Pre-bake word annotation before playback (one-time DOM walk, not per-frame)
- Toggle CSS classes directly on pre-annotated nodes in `timeupdate` — never write React state per frame
- Batch text into ~200-char chunks with lookahead prefetch for long documents
- Rule-based character-proportion timing as fallback when provider doesn't return timestamps
- Expose `followTime(t)` as a public method so an external time source (video, scrubber) can drive highlighting
- Keep `spokenHL.word` / `spokenHL.sentence` as React state for UI affordances (progress bar, seek) — just not for the highlight itself
