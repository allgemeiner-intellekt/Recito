# Supported TTS providers

Recito maintains dedicated adapters for Xiaomi MiMo and OpenAI, plus a Custom adapter for OpenAI-compatible speech services. This describes the current implementation, rather than every capability offered by those vendors.

| Entry | Current integration | Voice selection |
|-------|---------------------|-----------------|
| Xiaomi MiMo | Chat completions with base64 audio | Built-in catalog in the adapter |
| OpenAI | Audio speech endpoint | Built-in catalog in the adapter |
| Custom | OpenAI-compatible audio speech endpoint | Endpoint voice list |

MiMo historical model and voice compatibility is tracked in #8 and #9. OpenAI API migration is tracked in #7. This cleanup does not change their model selection or synthesis requests.

## Custom services

Supply a base URL, API key, and model. The adapter normalizes the URL to end in /v1, probes the voice endpoint, and requests complete audio from the speech endpoint. See `src/providers/custom.ts` and `src/providers/openai-compatible.ts` for the exact contract.

A service needs compatible request and response formats. A vendor name alone does not imply compatibility. The generic adapter does not restore removed providers' specialized timestamps, voice discovery, or quota tracking.

## Retired dedicated adapters

Groq and ElevenLabs dedicated adapters have been removed. Existing configurations remain in local storage and can be deleted in Settings, where they are marked unsupported. They are excluded from playback selectors and failover. An active retired provider selection is cleared without selecting another provider or converting the saved configuration.

To use a compatible service, add a new Custom configuration manually. Delete the old configuration once its saved key is no longer needed.

## Multi-key failover

Add multiple keys for the same provider group to allow failover to another healthy key. Custom configurations must use the same base URL to share a failover group. Health status is shown in Settings > Providers.
