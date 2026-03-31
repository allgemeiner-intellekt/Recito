# Multi-API Account Pooling & Failover — Implementation Plan

## Context

The Immersive Reader extension currently supports multiple `ProviderConfig` entries (each with its own API key), but has no failover between them. If a TTS request fails (rate limit, quota exceeded, bad key), playback stops entirely. Additionally, `synthesizeChunk()` re-reads the active provider from storage on **every chunk**, meaning a settings change mid-article silently changes the voice — a latent bug.

The user's original spec proposes a comprehensive Pool abstraction, quota-based routing, and a full UI replacement. After evaluating against the actual codebase, this plan **simplifies significantly** while delivering the same core value: automatic failover between API keys with voice consistency.

---

## Key Simplifications vs Original Spec

| Original Spec | This Plan | Rationale |
|---|---|---|
| Formal `AccountPool` data model with hash IDs, persisted to storage | **No new storage entity.** Failover groups computed at runtime by grouping existing `ProviderConfig[]` on `providerId + baseUrl` | The flat config list already supports multiple keys per provider. Adding a Pool layer creates migration burden with no functional benefit. |
| Quota-based routing (OpenAI billing API, ElevenLabs subscription API) | **Deferred.** Sequential failover on error instead | OpenAI billing API needs org-level auth, awkward from extension. ElevenLabs quota is feasible but not worth the complexity for v1. Simple failover on failure is sufficient. |
| Complete replacement of Providers UI with Pool Management page | **Incremental UI changes.** Add health indicators + visual grouping to existing provider cards | The current CRUD UI works. A full rewrite is disproportionate to the feature. |
| Manual-only health recovery (user must click "Retry") | **Time-based cooldowns** (auto-expire) for transient errors; manual reset only for 401 (bad key) | Forcing users to open settings for a transient 429 is poor UX. Cooldowns are trivial to implement. |
| `PlaybackSession` as a persisted data model with failover history | **In-memory session state** in the orchestrator (module-level variable) | Session state is ephemeral by nature. No need to persist. |

---

## Phase 1: Foundation — Typed Errors + Session Binding

No user-facing changes. Fixes real bugs and lays groundwork for failover.

### 1a. Create typed API error class

**New file:** `src/lib/api-error.ts`

```typescript
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,        // HTTP status (0 for network errors)
    public readonly providerId: string,
    public readonly retryable: boolean,     // Can we try another account?
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
```

Error classification:
- `401` → `retryable: false` (bad key, permanent)
- `429` → `retryable: true` (rate limit, switch account)
- `403` with quota message → `retryable: true` (quota exceeded)
- `>= 500` → `retryable: true` (server error, retry same first)
- Network/fetch error → `retryable: true`

### 1b. Update provider implementations to throw `ApiError`

**Modify:** `src/providers/openai.ts`, `src/providers/elevenlabs.ts`, `src/providers/groq.ts`, `src/providers/custom.ts`

Each provider already checks `response.status` and throws `new Error(...)`. Change to `throw new ApiError(msg, response.status, this.id, ...)`. Mechanical change — ~5 lines per file in `synthesize()` and `validateKey()`.

Wrap `fetch()` calls with a try/catch to convert `TypeError` (network failure) to `ApiError(msg, 0, id, true)`.

### 1c. Add session binding to the orchestrator

**Modify:** `src/background/orchestrator.ts`

Add module-level session state:
```typescript
interface PlaybackSession {
  config: ProviderConfig;      // Locked at session start
  voice: Voice;                // Locked at session start
  providerId: string;
  generation: number;          // Incremented on failover, used to discard stale prefetches
}
let currentSession: PlaybackSession | null = null;
let sessionGeneration = 0;
```

Changes to existing functions:
- **`startPlayback()`**: After content extraction, resolve active provider + voice ONCE, store in `currentSession`. Increment `sessionGeneration`.
- **`synthesizeChunk()`**: Use `currentSession.config` and `currentSession.voice` instead of calling `getActiveProvider()` + `listVoices()` per chunk. This also eliminates the per-chunk ElevenLabs API call for voice listing.
- **`stopPlayback()`**: Clear `currentSession`.
- **Prefetch loop**: Tag each prefetch with `sessionGeneration`. Discard results if generation has changed (handles race condition on failover).

### 1d. Voice list caching

**New file:** `src/providers/voice-cache.ts`

Simple in-memory cache: `Map<string, { voices: Voice[], cachedAt: number }>` keyed by `configId`, 5-minute TTL. Used by:
- `synthesizeChunk()` when resolving voices for session start
- `LIST_VOICES` message handler in `message-router.ts`
- Failover engine (Phase 2) when checking voice compatibility on candidate configs

---

## Phase 2: Failover Engine

### 2a. Create failover module

**New file:** `src/background/failover.ts`

**Health tracking** — in-memory `Map<string, ConfigHealth>`:
```typescript
interface ConfigHealth {
  status: 'healthy' | 'cooldown' | 'failed';
  lastError?: { message: string; status: number; timestamp: number };
  cooldownUntil?: number;   // ms timestamp, auto-expires
  failCount: number;
}
```

Cooldown rules:
- `429` (rate limit): Cooldown 60 seconds, try next candidate
- `403` (quota): Cooldown 5 minutes
- `401` (bad key): Mark `failed` permanently (cleared only by successful `validateKey`)
- `5xx` (server): Retry same config once with 1s delay, then cooldown 30 seconds
- Network error: Retry same config once, then cooldown 30 seconds
- Cooldowns auto-expire on next health check (no polling needed)

**Candidate selection** — `getNextCandidate(currentSession, failedConfigId)`:
1. Get all `ProviderConfig[]` from storage
2. Filter to same `providerId` (and same normalized `baseUrl` for custom providers)
3. Exclude configs with `status === 'failed'` or `cooldownUntil > Date.now()`
4. Exclude the just-failed config
5. For ElevenLabs: check voice cache (or fetch voices) to verify target `voiceId` is available
6. Return first healthy candidate, or `null` if none

**Public API:**
```typescript
export function markFailed(configId: string, error: ApiError): void;
export function markCooldown(configId: string, error: ApiError, durationMs: number): void;
export function isHealthy(configId: string): boolean;
export function getHealth(configId: string): ConfigHealth;
export function getAllHealth(): Map<string, ConfigHealth>;
export function clearHealth(configId: string): void;  // Manual reset
export async function getNextCandidate(session: PlaybackSession, failedConfigId: string): Promise<ProviderConfig | null>;
```

### 2b. Integrate failover into orchestrator

**Modify:** `src/background/orchestrator.ts` — change `synthesizeChunk()` error handling:

Current: `catch(err) → send PLAYBACK_ERROR → stop`

New:
```
catch(err):
  if not ApiError or not retryable → stop playback with error
  if 5xx → retry same config once with 1s delay

  mark config as cooldown/failed via failover module
  candidate = await getNextCandidate(session, failedConfigId)

  if no candidate:
    stop playback with message: "All API keys for {provider} exhausted. Errors: ..."
    return

  update currentSession with new config (keep same voice)
  prefetchCache.clear()
  sessionGeneration++
  retry synthesizeChunk with new config
```

Max failover attempts per chunk: 3 (prevents infinite loops if all candidates fail rapidly).

Also: send `FAILOVER_NOTICE` message to content script on successful failover (for toast notification in Phase 3d).

### 2c. New messages

**Modify:** `src/lib/messages.ts` — add:
```typescript
GET_PROVIDER_HEALTH: 'GET_PROVIDER_HEALTH',   // Options page reads health
RESET_PROVIDER_HEALTH: 'RESET_PROVIDER_HEALTH', // User resets failed config
FAILOVER_NOTICE: 'FAILOVER_NOTICE',            // Notify content script of failover
```

**Modify:** `src/background/message-router.ts` — handle `GET_PROVIDER_HEALTH` (return `getAllHealth()`) and `RESET_PROVIDER_HEALTH` (call `clearHealth(configId)`).

### 2d. Health status in Options UI

**Modify:** `src/options/Options.tsx`

On the existing provider cards, add a small colored dot:
- Green: healthy (default)
- Yellow: cooldown (with "Retrying in Xs" text)
- Red: failed (with error message + "Reset" button)

Poll `GET_PROVIDER_HEALTH` every 10 seconds when the Providers section is visible. Add a "Reset" button on failed configs that sends `RESET_PROVIDER_HEALTH`.

---

## Phase 3: UI Polish (optional, incremental)

### 3a. Componentize Options page

Split `src/options/Options.tsx` (718 lines) into:
- `src/options/sections/ProvidersSection.tsx`
- `src/options/sections/VoicesSection.tsx`
- `src/options/sections/PlaybackSection.tsx`
- `src/options/sections/HighlightingSection.tsx`
- `src/options/components/ProviderCard.tsx` (with health indicator)
- `src/options/components/ProviderFormModal.tsx`

Pure refactor, no functional changes.

### 3b. Visual grouping of failover-compatible configs

In ProvidersSection, group provider cards by `providerId` (+ `baseUrl` for custom). Show a subtle header: "OpenAI (2 keys — 1 healthy)" or "ElevenLabs (1 key)". Computed at render time from the flat config list — no new storage.

### 3c. Failover toast notification

**Modify:** `src/content/player/FloatingToolbar.tsx` + store

When `FAILOVER_NOTICE` message arrives, show a transient toast: "Switched to backup API key" that auto-dismisses after 3 seconds. Non-blocking — playback continues.

### 3d. Voice availability indicators

In the Voices section, when multiple configs exist for the active provider, show which voices are available across all configs vs only some. Use the voice cache to cross-reference. Display as a small badge: "Available on 2/3 keys" or a warning if only available on one.

---

## Critical Files Summary

| File | Phase | Change |
|------|-------|--------|
| `src/lib/api-error.ts` | 1 | NEW |
| `src/providers/openai.ts` | 1 | Throw ApiError |
| `src/providers/elevenlabs.ts` | 1 | Throw ApiError |
| `src/providers/groq.ts` | 1 | Throw ApiError |
| `src/providers/custom.ts` | 1 | Throw ApiError |
| `src/providers/voice-cache.ts` | 1 | NEW |
| `src/background/orchestrator.ts` | 1+2 | Session binding + failover integration |
| `src/background/failover.ts` | 2 | NEW |
| `src/lib/messages.ts` | 2 | Add health/failover messages |
| `src/background/message-router.ts` | 2 | Handle new messages |
| `src/options/Options.tsx` | 2+3 | Health indicators, then componentize |
| `src/content/player/FloatingToolbar.tsx` | 3 | Failover toast |

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Single config per provider (most users) | No failover candidates; error stops playback as today. No UX regression. |
| All configs for a provider are failed/cooldown | Stop playback with clear error listing each config's failure reason. |
| Service worker restarts mid-playback | Session lost, health map reset. Playback already stops on SW restart (abort controller). All configs reset to healthy (safe default). |
| User edits active config in Options during playback | Session continues with the config snapshot from session start. New config used on next session. |
| ElevenLabs custom voice not on backup account | Candidate is skipped. If no candidate has the voice, playback stops with: "Voice '{name}' not available on any backup key." |
| Prefetch in-flight when failover occurs | Stale prefetches discarded via `sessionGeneration` counter. Cache cleared, refilled with new config. |
| User disables a config that is currently playing | No concept of "disable" today. If added later, session continues with snapshot; next session respects disable. |
| 429 during prefetch (not main synthesis) | Silently swallowed today. With failover: mark config cooldown, but don't switch session — only switch on main synthesis failure. |

## Verification Plan

1. **Unit tests** for `src/lib/api-error.ts` and `src/background/failover.ts` (candidate selection, cooldown expiry, health state transitions)
2. **Manual test — session binding**: Start reading a long article, change active provider in Options mid-read, verify voice doesn't change
3. **Manual test — failover on 429**: Configure 2 OpenAI keys (one with exhausted quota), start reading, verify automatic switch to the working key
4. **Manual test — 401 permanent failure**: Add a config with an invalid key, set it active alongside a valid one, start reading, verify it switches and marks the bad key as failed
5. **Manual test — health display**: Open Options during playback, verify health dots reflect actual config status
6. **Manual test — single config (no regression)**: With only one config, verify errors still stop playback cleanly with a user-facing error message
