# Plan: ElevenLabs Model Selection

## Context
ElevenLabs offers multiple TTS models with different quality/speed tradeoffs. The provider backend already reads `config.extraParams.model_id` (line 86 of `elevenlabs.ts`) but the Options UI has no way to set it. We need a simple dropdown so users can pick between Economy (fast/cheap) and Quality (slower/better).

## Models
| Label | Model ID | Notes |
|-------|----------|-------|
| Economy | `eleven_flash_v2_5` | Fastest, cheapest |
| Quality | `eleven_multilingual_v2` | Current default, highest quality |

## Changes

### 1. Add model options constant — `src/providers/elevenlabs.ts`
Export an array of `{ label, modelId }` objects so the UI can render the dropdown without hardcoding model IDs.

```ts
export const ELEVENLABS_MODELS = [
  { label: 'Economy (Flash v2.5)', modelId: 'eleven_flash_v2_5' },
  { label: 'Quality (Multilingual v2)', modelId: 'eleven_multilingual_v2' },
] as const;
```

### 2. Extend form state & save logic — `src/options/Options.tsx`

- Add `modelId` field to `ProviderFormData` (default: `'eleven_multilingual_v2'`).
- In `getFormProviderConfig`, when `providerId === 'elevenlabs'`, set `extraParams: { model_id: form.modelId }`.
- In `openEditForm`, populate `modelId` from `config.extraParams?.model_id`.
- Render a `<select>` dropdown (conditionally when `form.providerId === 'elevenlabs'`) between the API Key and Test Connection button, using `ELEVENLABS_MODELS`.

### 3. No other files need changes
- `elevenlabs.ts` synthesize already reads `extraParams.model_id` and falls back to `DEFAULT_MODEL_ID`.
- Storage schema (`ProviderConfig.extraParams`) already supports arbitrary keys.
- No type changes needed.

## Files to modify
1. `src/providers/elevenlabs.ts` — add exported `ELEVENLABS_MODELS` constant
2. `src/options/Options.tsx` — form state, save logic, conditional dropdown

## Verification
1. `npm run typecheck` — no type errors
2. `npm run build` — clean build
3. Load extension → Options → Add Provider → select ElevenLabs → model dropdown appears with two options
4. Save provider → edit it again → model selection persists
5. Switch to OpenAI provider type → model dropdown disappears
6. Play audio with each model → confirm different audio characteristics
