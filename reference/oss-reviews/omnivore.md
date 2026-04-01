# Omnivore — Reading Queue & PDF Review

## Architecture Sketch

### Queue Data Model (`packages/api/src/entity/library_item.ts`)

The core queue entity is `LibraryItem`, a TypeORM-decorated PostgreSQL entity. Key fields:

- **Identity**: `id` (UUID), `userId`, `slug`, `originalUrl`
- **Content**: `readableContent` (full parsed HTML), `itemType`, `contentReader` (enum: `WEB | PDF | EPUB`), `uploadFileId` (foreign key to uploaded files)
- **State**: `state` (enum: `FAILED | PROCESSING | SUCCEEDED | DELETED | ARCHIVED | CONTENT_NOT_FETCHED`)
- **Folder**: `folder` (string, e.g. `"inbox"`) — used to separate the reading queue from archive/following
- **Reading progress** (four separate columns):
  - `readingProgressTopPercent` (REAL) — highest scroll position reached at the top of the viewport
  - `readingProgressBottomPercent` (REAL) — farthest position read (bottom of viewport)
  - `readingProgressLastReadAnchor` (INTEGER) — last anchor element index visited
  - `readingProgressHighestReadAnchor` (INTEGER) — max anchor ever seen
- **Timestamps**: `savedAt`, `readAt`, `archivedAt`, `deletedAt`, `publishedAt`, `seenAt`, `digestedAt`
- **Metadata**: `wordCount`, `siteName`, `siteIcon`, `thumbnail`, `author`, `description`, `itemLanguage`, `directionality`
- **Relations**: `labels` (many-to-many via `entity_labels`), `highlights` (one-to-many), `recommendations`, `uploadFile`
- **Denormalised arrays**: `labelNames: string[]`, `highlightAnnotations: string[]` — PostgreSQL arrays stored directly on the row for fast search/filter without joins
- **Search index**: a full-text `search_tsv` column (tsvector, not in entity but referenced in queries)

### Browser Extension "Save to Queue" Flow

There is no standalone Chrome extension package in the main repo. The save-to-queue flow works via:

1. **Web UI clip** (`packages/web/lib/hooks/useAddItem` → `GQL_SAVE_URL` mutation): user pastes a URL or triggers a save. Calls `saveUrl` service on the backend.
2. **iOS Safari Extension** (`apple/` — entitlements files present, no separate JS extension).
3. **Backend entry point** (`packages/api/src/services/save_url.ts` → `createPageSaveRequest`):
   - Validates URL (blocks private IPs, non-HTTP, localhost).
   - Immediately creates a `LibraryItem` row in state `PROCESSING` with placeholder content `"Your link is being saved..."`.
   - Inserts the item into the React Query cache (`insertItemInCache`) optimistically in the UI so the card appears instantly.
   - Rate-limits heavy savers by counting Redis sorted-set entries in the last 60s: ≥5 saves/min → `low` priority queue, else `high`.
   - Calls `enqueueFetchContentJob` which dispatches a Cloud Tasks / BullMQ task to `content-fetch` / `puppeteer-parse` for actual HTML retrieval and Readability parsing.
4. **Content ingestion** (`packages/api/src/services/save_page.ts`): once parsed content arrives, calls `parsedContentToLibraryItem` to build the full `LibraryItem` shape (word count, slug, content hash, contentReader type, reading progress initialised to 0) and upserts it via `createOrUpdateLibraryItem`. Publishes a PubSub `entityCreated` event for downstream sync.

### Queue Auto-Advance Logic

Omnivore does **not** have a built-in TTS-style auto-advance. The library is a reading queue, not a TTS playback queue. Navigation between items is driven by the web frontend's `useGetLibraryItems` infinite scroll hook — cursor-based pagination via GraphQL, sorted by `saved_at DESC` by default. There is no "play next article" concept; users navigate manually. The appreader package (`packages/appreader/src/index.jsx`) is a single-file embedded reader, not a queue player.

### Reading Progress Tracking

**Anchor-based system** (`packages/web/lib/hooks/useReadingProgressAnchor.tsx`):

- On mount, `parseDomTree` walks the entire article DOM and stamps every element with `data-omnivore-anchor-idx` (1-based integer).
- An `IntersectionObserver` (threshold: 1.0 — fully visible only) fires as elements come into view and tracks the topmost fully-visible element index.
- The anchor index is debounced and sent to the backend via `GQL_SAVE_ARTICLE_READING_PROGRESS` mutation.

**Scroll percent** (`packages/web/lib/hooks/useScrollWatcher.tsx`):
- A throttled `scroll` listener computes `scrollTop / documentHeight` as both top percent and bottom percent.
- Sent as part of the same `saveArticleReadingProgress` mutation: `{ id, readingProgressPercent, readingProgressTopPercent, readingProgressAnchorIndex }`.

**Backend write** (`updateLibraryItemReadingProgress` in `library_item.ts`):
- Raw SQL UPDATE with monotonically-increasing constraints: only advances progress, never goes backward (unless explicitly reset to 0).
- `reading_progress_top_percent` and `reading_progress_bottom_percent` are both only updated if the new value is strictly greater OR if resetting to 0.
- Fires a PubSub `entityUpdated` event only at 0% and 100% (start/finish boundaries) to reduce sync noise.

**Redis read-position cache** (`packages/api/src/services/cached_reading_position.ts`):
- Key: `omnivore:reading-progress:{uid}:{libraryItemId}` — a Redis SET (not a single value).
- Multiple devices can write simultaneously; each `push` adds a new timestamped JSON member to the set with `SADD`.
- On read, `reduceCachedReadingPositionMembers` takes `Math.max` across all set members for percent, top percent, and anchor index — conflict-free multi-device merge without locking.
- Items expire after the session; the definitive value is always PostgreSQL.

### PDF Text Extraction Pipeline (`packages/pdf-handler/src/pdf.ts`)

Uses `pdfjs-dist` (Mozilla's pdf.js) server-side:

1. `parsePdf(url)` loads the document via `_getDocument(url)`.
2. Reads PDF metadata: `Title`, `Author`, `Subject` → mapped to `title`, `author`, `description`.
3. `readPdfText` loops pages 1..N, calling `pdfPage.getTextContent()` for each.
4. `parsePageItems` reconstructs lines from raw `TextItem` objects using the affine transform matrix: groups items by Y coordinate, sorts within lines by X, inserts spaces proportional to horizontal gaps, inserts blank lines for vertical gaps larger than line height.
5. Strips null bytes (`/\x00/g`) from the full text.
6. Result (`ParsedPdf`) is enqueued as an `update-pdf-content` BullMQ job (`packages/pdf-handler/src/job.ts`) with `priority: 5, attempts: 3, exponential backoff` → consumed by the API's `queue-processor` which calls `update_pdf_content.ts` service to write the extracted content back to `library_item.readable_content`.

---

## Reusable Patterns

1. **Queue schema design**: `folder` string + `state` enum is a clean, extensible way to represent inbox/archive/trash without separate tables. The denormalised `labelNames`/`highlightAnnotations` arrays enable fast filter queries without joins.

2. **Dual progress tracking**: storing both a scroll `percent` (float) and an `anchorIndex` (integer DOM element index) gives resilience: the anchor survives content re-renders; the percent is human-readable. For a TTS reader, the `anchorIndex` is directly usable as a "sentence/paragraph index" to resume playback.

3. **Redis SET for multi-device progress**: write-append-then-max-reduce is a simple CRDT pattern. No locks, no last-write-wins conflicts. Trivially portable for a Chrome extension that may have multiple tabs open.

4. **Optimistic UI insert**: `insertItemInCache` adds a `PROCESSING` stub immediately so the card appears in the library without waiting for content fetch. Good pattern for our "save for later" flow.

5. **Rate-limit queue priority via Redis sorted sets**: sliding window (60s) with `ZADD`/`ZREMRANGEBYSCORE`/`ZCARD` is a lightweight way to throttle aggressive savers. Relevant if we allow batch saving.

6. **PDF pipeline**: the `parsePageItems` logic (Y-coord grouping, X-coord sorting, gap-proportional space insertion) is the most battle-tested open approach to getting clean readable text from pdf.js `TextItem` arrays. This is directly adaptable.

7. **TTS abstract interface** (`TextToSpeech` base class + `use(input)` selector method): the provider-switching pattern (OpenAI vs Azure) via a `use()` predicate is a clean BYOK hook. Rename providers to ElevenLabs/Groq/OpenAI and the skeleton works.

8. **Reading progress mutation shape**: `{ id, readingProgressPercent, readingProgressTopPercent, readingProgressAnchorIndex }` is a well-thought-out API surface. The `force` flag to bypass the monotonically-increasing guard is needed for "mark as unread" resets.

---

## Gotchas

1. **No standalone Chrome extension**: Omnivore never shipped a general Chrome extension with its own content script UI. The browser clip is done via a web app URL bar or a bookmarklet/iOS Safari extension. There is no reference implementation for a Chrome MV3 extension with a popup, content script DOM extraction, or background service worker to study here.

2. **Entire stack is server-side**: the reading progress cache requires Redis; the save flow requires Cloud Tasks or BullMQ; PDF extraction runs in a separate GCP Cloud Function. Nothing is designed to work offline or in a local-first extension. Adapting any of this requires stripping the cloud dependencies entirely.

3. **queue-manager is a GCP operations tool**: `packages/queue-manager` is not the reading queue data model — it's a Cloud Tasks monitoring/auto-pause daemon that watches AppEngine latency metrics and pauses RSS/import queues if P95 latency exceeds 500ms. Irrelevant to our use case.

4. **Progress is monotonically increasing by design**: the SQL update guard (`WHEN reading_progress_top_percent < $2 THEN $2`) means you cannot freely seek backwards in an article without an explicit `force: true` flag. For a TTS reader that seeks freely, you'll need to remove this constraint.

5. **TTS is server-side and GCS-cached**: audio is generated on a Cloud Function, stored in GCS, and delivered as a hex-encoded MP3 buffer over HTTP. The streaming handler does utterance-level synthesis but still round-trips to the cloud. No browser-native TTS (`speechSynthesis` API) is used anywhere. For BYOK we would be calling provider APIs directly from the extension — a fundamentally different architecture.

6. **pdf.js `TextItem` parsing is layout-sensitive**: the line reconstruction algorithm assumes standard left-to-right, top-to-bottom Latin text. RTL PDFs, multi-column layouts, and PDFs with rotated text will produce garbled output. The code has a `MAX_TITLE_LENGTH` constant and a null byte strip but no column detection.

7. **PubSub sync complexity**: the `entityCreated`/`entityUpdated`/`entityDeleted` events flow through Google Cloud Pub/Sub to sync across clients. This is a significant infrastructure dependency with no local equivalent. For the extension, a simpler localStorage + chrome.storage.sync strategy suffices.

8. **Large areas to avoid**: `packages/api/src/services/library_item.ts` is 900+ lines of TypeORM query builder logic with Liqe (a custom search DSL) parsing. `packages/web/lib/networking/library_items/useLibraryItems.tsx` is 600+ lines of React Query cache management. Both are deeply coupled to their server/GraphQL infrastructure and are not extractable.

---

## Decision

**Take inspiration only.**

Do not use as a dependency (requires full GCP/PostgreSQL/Redis/BullMQ infrastructure). Do not adapt code directly (too server-coupled; cloud storage everywhere).

Specific things worth extracting manually:

- The `parsePageItems` PDF text reconstruction logic from `packages/pdf-handler/src/pdf.ts` — copy-adapt this function (~80 lines, no dependencies beyond pdfjs-dist).
- The dual anchor+percent progress model — implement in chrome.storage.local with the same field names for future compatibility.
- The `TextToSpeech` abstract base class + `use()` selector pattern — adapt for ElevenLabs/Groq/OpenAI BYOK providers.
- The Redis SET multi-device merge pattern — replace Redis with chrome.storage.sync CRDT (last-write or max-merge).
- The `insertItemInCache` optimistic UI pattern — add a `PROCESSING` state card before the save completes.
