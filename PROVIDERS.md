# Supported TTS providers

Recito maintains dedicated adapters for Xiaomi MiMo and OpenAI, plus a Custom adapter for OpenAI-compatible speech services. This describes the current implementation, rather than every capability offered by those vendors.

| Entry | Current integration | Voice selection |
|-------|---------------------|-----------------|
| Xiaomi MiMo | `mimo-v2.5-tts` chat completions with base64 audio | Current v2.5 built-in catalog |
| OpenAI | Audio speech endpoint | Built-in catalog in the adapter |
| Custom | OpenAI-compatible audio speech endpoint | Endpoint voice list |

## Xiaomi MiMo

Recito integrates preset voice synthesis with `mimo-v2.5-tts`. It reads the complete base64 audio response before playback. Voice cloning, voice design, dedicated emotion/dialect controls, and incremental audio playback are not integrated.

The catalog contains the named Chinese voices 冰糖, 茉莉, 苏打, 白桦 and English voices Mia, Chloe, Milo, Dean, using their official case. `mimo_default` is a deployment-dependent default, not an additional independent voice: the official guide maps it to 冰糖 in the China cluster and Mia in other clusters. Recito sends that ID unchanged rather than assuming a cluster or language.

The historical IDs `default_zh` and `default_en` are absent from the current catalog. They are no longer offered or sent, including on nonofficial endpoints. Saved historical or unlisted voice selections remain in settings until the user selects a current voice. Playback stops with a reselection prompt instead of silently switching voices. An unset voice uses `mimo_default`.

On the official endpoint `https://api.xiaomimimo.com/v1`, including a trailing slash or an omitted base URL, saved configurations with a missing model or `mimo-v2-tts` migrate to `mimo-v2.5-tts`. API keys and other configuration fields are retained. Reading configurations, editing/saving them, and synthesis/connection validation use the same model rule. Voice caches refresh when the model, provider, or base URL changes.

For nonofficial MiMo base URLs, explicit model names are retained, and a missing model is recorded as the historical default `mimo-v2-tts`. Settings exposes the base URL and an editable model name. The voice choices still use the current v2.5 catalog; compatibility with a particular service is not guaranteed. Recito does not apply the official endpoint's retirement schedule to other services.

Sources checked on 2026-11-04: [MiMo model retirement notice](https://mimo.mi.com/docs/zh-CN/updates/deprecate) and [v2.5 synthesis guide and voice catalog](https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5). The guide does not document a mapping for the two historical IDs; their server-side acceptance has not been tested. Migration and voice-selection behavior are covered by mocked request and settings/playback tests, not live synthesis tests.

OpenAI API migration remains tracked separately in #7.

## Custom services

Supply a base URL, API key, and model. The adapter normalizes the URL to end in /v1, probes the voice endpoint, and requests complete audio from the speech endpoint. See `src/providers/custom.ts` and `src/providers/openai-compatible.ts` for the exact contract.

A service needs compatible request and response formats. A vendor name alone does not imply compatibility. The generic adapter does not restore removed providers' specialized timestamps, voice discovery, or quota tracking.

## Retired dedicated adapters

Groq and ElevenLabs dedicated adapters have been removed. Existing configurations remain in local storage and can be deleted in Settings, where they are marked unsupported. They are excluded from playback selectors and failover. An active retired provider selection is cleared without selecting another provider or converting the saved configuration.

To use a compatible service, add a new Custom configuration manually. Delete the old configuration once its saved key is no longer needed.

## Multi-key failover

Add multiple keys for the same provider group to allow failover to another healthy key. Custom configurations must use the same base URL to share a failover group. Health status is shown in Settings > Providers.
