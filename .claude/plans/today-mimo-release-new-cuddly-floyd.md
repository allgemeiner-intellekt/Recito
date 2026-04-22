# Mimo model selection

## Context

Xiaomi shipped `mimo-v2.5-tts` today (2026-04-22) alongside the existing `mimo-v2-tts`. Our Mimo provider hardcodes `mimo-v2-tts` in `src/providers/mimo.ts:6`, so users can't opt into the new model. Add a per-config model dropdown (same pattern as ElevenLabs) so users can pick `mimo-v2.5-tts` (new, default) or `mimo-v2-tts` (legacy). Voice-clone and voice-design variants are out of scope — they require additional inputs (reference audio / design spec) that don't fit the read-a-page flow.

Storage: `ProviderConfig.extraParams.model` (mirrors the Custom provider's key name, already supported by the existing `ProviderConfig` type in `src/lib/types.ts:3`). New configs default to `mimo-v2.5-tts`; existing Mimo configs without `extraParams.model` fall back to `mimo-v2-tts` to preserve current behavior.

## Changes

### 1. `src/providers/mimo.ts`

- Export a `MIMO_MODELS` constant (shape matches `ELEVENLABS_MODELS` in `src/providers/elevenlabs.ts:8`):
  ```ts
  export const MIMO_MODELS = [
    { label: 'v2.5 (Latest)', modelId: 'mimo-v2.5-tts' },
    { label: 'v2 (Legacy)',   modelId: 'mimo-v2-tts' },
  ] as const;
  ```
- Keep `DEFAULT_MODEL = 'mimo-v2-tts'` as the backwards-compat fallback for configs saved before this change.
- Change `buildRequestBody(text, voiceId)` → `buildRequestBody(text, voiceId, model)` and use the passed `model` in the body.
- In `synthesize()`, resolve `model = (config.extraParams?.model as string) ?? DEFAULT_MODEL` and pass it to `buildRequestBody`.
- In `validateKey()`, do the same so the connection test runs against the user-selected model.

### 2. `src/options/Options.tsx`

Reuse the ElevenLabs dropdown pattern verbatim.

- Import `MIMO_MODELS` from `@providers/mimo` next to the existing `ELEVENLABS_MODELS` import.
- `ProviderFormData` (line 62): add `mimoModel: string`.
- `EMPTY_FORM` (line 71): add `mimoModel: 'mimo-v2.5-tts'` so new Mimo configs default to the latest model.
- `getFormProviderConfig()` (lines 90–94): add
  ```ts
  else if (trimmedProviderId === 'mimo') {
    config.extraParams = { model: form.mimoModel };
  }
  ```
- `openEditForm()` (lines 244–251): add
  ```ts
  mimoModel: (config.extraParams?.model as string) ?? 'mimo-v2-tts',
  ```
  (fallback is `mimo-v2-tts` here, not v2.5 — old saved configs must keep the model they were using).
- In the form JSX (right after the ElevenLabs model block at lines 743–761), add a sibling block:
  ```tsx
  {form.providerId === 'mimo' && (
    <label className="form-label">
      Model
      <select
        className="form-select"
        value={form.mimoModel}
        onChange={(e) => {
          setTestResult(null);
          setForm(nextFormState(form, { mimoModel: e.target.value }));
        }}
      >
        {MIMO_MODELS.map((m) => (
          <option key={m.modelId} value={m.modelId}>{m.label}</option>
        ))}
      </select>
    </label>
  )}
  ```

## Files touched

- `src/providers/mimo.ts` — add `MIMO_MODELS` export, thread model through `buildRequestBody` / `synthesize` / `validateKey`.
- `src/options/Options.tsx` — extend form state, save/load logic, and render the Mimo model dropdown.

No changes required in `src/providers/registry.ts`, `src/lib/types.ts`, or storage migration code — `extraParams` is already an open `Record<string, unknown>` and the fallback in `synthesize()` handles pre-existing configs.

## Verification

1. `npm run typecheck && npm run lint` — must pass.
2. `npm run build` — produces `dist/` without errors.
3. `npm run dev`, load the unpacked extension, open Options → Providers:
   - Add a new Mimo provider → model dropdown appears with "v2.5 (Latest)" selected by default; save.
   - Edit an existing (pre-change) Mimo provider → dropdown shows "v2 (Legacy)" (backwards-compat fallback).
   - Switch to "v2.5 (Latest)", save, trigger playback on any page, confirm audio plays.
   - Open DevTools → Network, inspect the `POST /v1/chat/completions` request body → `"model": "mimo-v2.5-tts"`.
   - Flip back to v2, replay, confirm body shows `"model": "mimo-v2-tts"`.
   - Click "Test connection" on both selections → both succeed with a valid key.
4. No existing Vitest suite covers `mimo.ts`; matching the existing test coverage posture, no new tests are added unless requested.
