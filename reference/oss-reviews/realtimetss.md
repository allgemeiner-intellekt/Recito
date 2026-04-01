# RealtimeTTS — Chunking & Pipeline Review

_Python | https://github.com/KoljaB/RealtimeTTS_

## Architecture Sketch

```
TextToAudioStream
  ├── engines: List[BaseEngine]          # fallback chain
  ├── stream_player: StreamPlayer        # pyaudio output
  ├── tokenizer: "nltk" | "stanza"       # sentence splitting
  └── play_thread: Thread                # async playback loop

BaseEngine (abstract)
  ├── queue: Queue[bytes]                # audio chunk output
  ├── timings: Queue[TimingInfo]         # word-level timestamps
  ├── on_audio_chunk: Callable           # streaming callback
  └── synthesize(text: str) -> bool      # puts chunks into queue

Pipeline flow:
  text_stream → stream2sentence (sentence splitting)
               → engine.synthesize(sentence) → queue.put(audio_chunk)
               → StreamPlayer.play_chunk()
```

**Key dependency:** `stream2sentence` — a separate library that does the actual sentence boundary detection. RealtimeTTS delegates chunking entirely to this library. We should look at `stream2sentence` directly.

## Reusable Patterns

**Queue-based decoupling (adapt to TypeScript):**
```python
# Engine writes to self.queue; player reads from self.queue
# Synthesis and playback run on separate threads
# This is the right architecture: synthesis pipeline never blocks on audio output
```
TypeScript equivalent: use `ReadableStream` or an async queue (e.g., `p-queue`) between the synthesis pipeline and the audio player.

**`BaseEngine` interface (port to TypeScript):**
```ts
interface TTSEngine {
  synthesize(text: string): Promise<void>; // puts chunks into output stream
  getVoices(): Voice[];
  setVoice(voice: string): void;
  // timings queue for word-level sync (provider-dependent)
}
```

**Multi-engine failover pattern:**
```python
# Constructor accepts List[BaseEngine]
# On synthesis failure, increments engine_index and retries with next engine
# Transparent to caller
```
Worth implementing: allows graceful degradation from ElevenLabs → OpenAI → browser TTS on failure.

**`TimingInfo` model:**
```python
class TimingInfo:
    start_time: float   # seconds from audio start
    end_time: float     # seconds from audio start
    word: str
```
Only Azure and Kokoro engines provide real timing data. Others use estimation. This matches the js-tts-wrapper pattern.

**`on_word` callback pattern:**
```python
# Registered on TextToAudioStream constructor
# Called when word is spoken (only for engines that provide timing data)
# For others: no callback, no timing = no highlighting
```

**Chunk size / buffer management:**
`playout_chunk_size` param controls audio output chunk size. `-1` = let PyAudio decide. Relevant for latency tuning: smaller chunks → lower latency, higher CPU.

## Gotchas

1. **Sentence splitting is entirely `stream2sentence`** — RealtimeTTS itself has no sentence boundary logic. All abbreviation handling, decimal detection, URL detection is in that external library. For TypeScript, we need to either port `stream2sentence` or find a JS equivalent.

2. **Word timing is provider-specific** — only Azure and Kokoro return real word timestamps. For OpenAI/ElevenLabs, there are no timestamps in the Python engine (relies on estimation). But OpenAI's `verbose_json` format does return word timestamps — the Python engine doesn't use this. We should.

3. **PyAudio dependency** — `stream_player.py` is tightly coupled to PyAudio (a C extension). The audio output layer is not portable. Ignore `StreamPlayer` entirely — we have Web Audio API.

4. **Multi-process queue** — `stop_synthesis_event = mp.Event()` uses `torch.multiprocessing` (!) for the stop signal. Python-specific, not portable.

5. **No backpressure** — engine writes to queue as fast as synthesis produces chunks; `StreamPlayer` consumes them. If synthesis is much faster than playback, queue grows unbounded. Our TypeScript implementation should add backpressure.

6. **`stream2sentence` details to investigate:**
   - Repo: https://github.com/KoljaB/stream2sentence
   - Handles: abbreviations (Dr., U.S.A.), decimal numbers, ellipses, URLs
   - Config: `min_sentence_length`, `min_first_fragment_length`, `max_sentence_length`
   - Uses NLTK sentence tokenizer as its backend
   - Worth porting the sentence accumulation/flushing logic (not the NLTK tokenizer)

## Decision

**Adapt algorithms — do not use as dependency (Python only).**

Key things to port to TypeScript:
1. The `stream2sentence` sentence accumulation algorithm — flush when sentence boundary detected, with configurable min length
2. The queue-based engine ↔ player decoupling pattern
3. The `TimingInfo` model for word-level sync
4. The multi-engine fallover chain

Ignore: PyAudio output layer, torch.multiprocessing, all Python-specific concurrency.

**Action:** Separately review `https://github.com/KoljaB/stream2sentence` before implementing the chunking pipeline.
