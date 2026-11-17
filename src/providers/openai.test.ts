import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openaiProvider } from './openai';
import { closeAllRealtimeSessions } from './openai-realtime';
import { ApiError } from '@shared/api-error';
import type { ProviderConfig } from '@shared/types';

const config: ProviderConfig = {
  id: 'openai-1',
  providerId: 'openai',
  name: 'OpenAI',
  apiKey: 'sk-test-key-at-least-16-chars',
};

interface ClientEvent {
  type: string;
  event_id?: string;
  response_id?: string;
  response: {
    conversation?: string;
    output_modalities?: string[];
    metadata: Record<string, string>;
    input: { content: { text: string }[] }[];
  };
}

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = 0;
  sent: ClientEvent[] = [];
  onmessage: ((m: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(
    public url: string,
    public protocols: string[],
  ) {
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.emit({ type: 'session.created', session: {} });
    });
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = 3;
  }
  emit(event: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(event) });
  }
  lastCreate() {
    return [...this.sent].reverse().find((e) => e.type === 'response.create')!;
  }
  /** Reply to a response.create with audio and a final status. */
  respond(create: ClientEvent, responseId: string, pcm: number[], status = 'completed') {
    this.emit({
      type: 'response.created',
      response: { id: responseId, metadata: create.response.metadata },
    });
    this.emit({
      type: 'response.output_audio.delta',
      response_id: responseId,
      delta: btoa(String.fromCharCode(...pcm)),
    });
    this.emit({ type: 'response.done', response: { id: responseId, status } });
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function mockMint(status = 200) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(status === 200 ? { value: 'ek_test' } : { error: {} }), { status }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  closeAllRealtimeSessions();
  vi.unstubAllGlobals();
});

describe('OpenAI Realtime synthesis', () => {
  it('mints a client secret and authenticates the socket with it', async () => {
    const fetchMock = mockMint();
    const result = openaiProvider.synthesize('Hello there.', { id: 'marin', name: 'Marin' }, config, { speed: 1.25 });
    await flush();
    await flush();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/realtime/client_secrets');
    expect(init.headers.Authorization).toBe(`Bearer ${config.apiKey}`);
    const body = JSON.parse(init.body);
    expect(body.session).toMatchObject({
      model: 'gpt-realtime-2.1-mini',
      output_modalities: ['audio'],
      audio: { output: { voice: 'marin', speed: 1.25, format: { type: 'audio/pcm', rate: 24000 } } },
    });

    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toBe('wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1-mini');
    expect(ws.protocols).toEqual(['realtime', 'openai-insecure-api-key.ek_test']);

    const create = ws.lastCreate();
    expect(create.response).toMatchObject({ conversation: 'none', output_modalities: ['audio'] });
    expect(create.response.input[0].content[0].text).toBe('<read>Hello there.</read>');
    ws.respond(create, 'resp_1', [1, 0, 2, 0]);

    const { audioData, format } = await result;
    expect(format).toBe('wav');
    const bytes = new Uint8Array(audioData);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    expect(new DataView(audioData).getUint32(24, true)).toBe(24000);
    expect([...bytes.slice(44)]).toEqual([1, 0, 2, 0]);
  });

  it('reuses one session for concurrent chunks and routes audio by response', async () => {
    mockMint();
    const voice = { id: 'marin', name: 'Marin' };
    const a = openaiProvider.synthesize('First.', voice, config);
    const b = openaiProvider.synthesize('Second.', voice, config);
    await flush();
    await flush();

    expect(FakeWebSocket.instances).toHaveLength(1);
    const ws = FakeWebSocket.instances[0];
    const [createA, createB] = ws.sent.filter((e) => e.type === 'response.create');
    ws.respond(createB, 'resp_b', [9, 9]);
    ws.respond(createA, 'resp_a', [7, 7]);

    expect([...new Uint8Array((await a).audioData).slice(44)]).toEqual([7, 7]);
    expect([...new Uint8Array((await b).audioData).slice(44)]).toEqual([9, 9]);
  });

  it('cancels the server response when the chunk is aborted', async () => {
    mockMint();
    const controller = new AbortController();
    const result = openaiProvider.synthesize('Skip me.', { id: 'marin', name: 'Marin' }, config, {
      signal: controller.signal,
    });
    await flush();
    await flush();
    const ws = FakeWebSocket.instances[0];
    const create = ws.lastCreate();
    ws.emit({ type: 'response.created', response: { id: 'resp_x', metadata: create.response.metadata } });

    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(ws.sent.at(-1)).toEqual({ type: 'response.cancel', response_id: 'resp_x' });
  });

  it('maps retired tts-1 voices to Realtime voices', async () => {
    expect(openaiProvider.resolveVoiceId!('nova', config)).toBe('coral');
    expect(openaiProvider.resolveVoiceId!('onyx', config)).toBe('ash');
    expect(openaiProvider.resolveVoiceId!('fable', config)).toBe('ballad');
    expect(openaiProvider.resolveVoiceId!('alloy', config)).toBe('alloy');
    const ids = (await openaiProvider.listVoices(config)).map((v) => v.id);
    expect(ids).not.toContain('nova');
    expect(ids.slice(0, 2)).toEqual(['marin', 'cedar']);
  });

  it('surfaces an invalid key as a non-retryable 401', async () => {
    mockMint(401);
    await expect(
      openaiProvider.synthesize('Hi.', { id: 'marin', name: 'Marin' }, config),
    ).rejects.toMatchObject({ status: 401, retryable: false } satisfies Partial<ApiError>);
  });

  it('rejects with the server error tied to the request event', async () => {
    mockMint();
    const result = openaiProvider.synthesize('Hi.', { id: 'marin', name: 'Marin' }, config);
    await flush();
    await flush();
    const ws = FakeWebSocket.instances[0];
    ws.emit({
      type: 'error',
      error: { message: 'Too many requests', code: 'rate_limit_exceeded', event_id: ws.lastCreate().event_id },
    });
    await expect(result).rejects.toMatchObject({ status: 429, retryable: true });
  });

  it('validates a key by minting a client secret', async () => {
    const fetchMock = mockMint();
    expect(await openaiProvider.validateKey(config)).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/realtime/client_secrets');
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});

describe('OpenAI legacy speech endpoint', () => {
  const legacy = { ...config, baseUrl: 'https://speech.example.com/v1' };

  it('keeps /audio/speech for configs pointing at a compatible host', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal('fetch', fetchMock);
    const result = await openaiProvider.synthesize('Hi.', { id: 'nova', name: 'Nova' }, legacy);

    expect(fetchMock.mock.calls[0][0]).toBe('https://speech.example.com/v1/audio/speech');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ model: 'tts-1', voice: 'nova' });
    expect(result.format).toBe('mp3');
    expect(openaiProvider.resolveVoiceId!('nova', legacy)).toBe('nova');
    expect(FakeWebSocket.instances).toHaveLength(0);
  });
});
