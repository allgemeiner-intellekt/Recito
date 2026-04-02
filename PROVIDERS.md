# Supported TTS Providers

Immersive Reader supports any OpenAI-compatible TTS API. Below is a comparison of the built-in provider presets.

| Provider | Voices | Latency | Quality | Free Tier | Pricing |
|----------|--------|---------|---------|-----------|---------|
| **OpenAI** | 6 built-in (alloy, echo, fable, onyx, nova, shimmer) | ~500ms | High | No | $15/1M chars (tts-1), $30/1M chars (tts-1-hd) |
| **ElevenLabs** | 1000+ (incl. voice cloning) | ~300-800ms | Very High | 10k chars/month | From $5/mo (30k chars) |
| **Groq** | PlayAI voices | ~100-200ms | Good | Yes (rate-limited) | Pay-per-use |
| **Custom** | Depends on endpoint | Varies | Varies | Varies | Varies |

## Provider Details

### OpenAI

- **API Keys**: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Models**: `tts-1` (faster, lower quality), `tts-1-hd` (slower, higher quality)
- **Formats**: mp3, opus, aac, flac
- **Best for**: Reliable, consistent quality with simple voice selection

### ElevenLabs

- **API Keys**: [elevenlabs.io/app/settings/api-keys](https://elevenlabs.io/app/settings/api-keys)
- **Models**: `eleven_multilingual_v2` (recommended), `eleven_turbo_v2_5`, `eleven_monolingual_v1`
- **Best for**: Highest quality, multilingual support, custom/cloned voices
- **Note**: Character-based billing; usage is shown in the provider settings panel

### Groq

- **API Keys**: [console.groq.com/keys](https://console.groq.com/keys)
- **Models**: PlayAI TTS
- **Best for**: Ultra-low latency; great for real-time reading on long articles
- **Note**: Smaller chunk sizes are used automatically for optimal streaming

### Custom (OpenAI-compatible)

Any endpoint that implements the OpenAI TTS API (`POST /v1/audio/speech`, `GET /v1/audio/voices`).

- Provide your own **Base URL** and **API Key**
- Useful for self-hosted models (e.g., Piper, Coqui) behind an OpenAI-compatible wrapper
- The extension auto-appends `/v1` if your base URL doesn't already include it

## Multi-key Failover

You can add multiple API keys for the same provider. If one key hits a rate limit or fails, the extension automatically fails over to the next healthy key. Health status is shown in Settings > Providers.
