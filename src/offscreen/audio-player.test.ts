import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MSG } from '@shared/messages';
import { AudioPlayer } from './audio-player';

class MockSource {
  buffer: AudioBuffer | null = null;
  playbackRate = { value: 1 };
  onended: (() => void) | null = null;
  connect = vi.fn();
  disconnect = vi.fn();
  start = vi.fn();
  stop = vi.fn();

  end() {
    this.onended?.();
  }
}

const buffer = (duration = 10) => ({ duration }) as AudioBuffer;

class MockContext {
  currentTime = 0;
  state = 'running';
  destination = {};
  sources: MockSource[] = [];
  decodeAudioData = vi.fn(async (_data: ArrayBuffer) => buffer());
  gain = { gain: { value: 1 }, connect: vi.fn() };
  createGain = () => this.gain;
  createBufferSource = () => {
    const source = new MockSource();
    this.sources.push(source);
    return source;
  };
}

describe('AudioPlayer', () => {
  let ctx: MockContext;
  let player: AudioPlayer;
  let sendMessage: ReturnType<typeof vi.fn>;
  const data = new ArrayBuffer(0);

  beforeEach(() => {
    vi.useFakeTimers();
    ctx = new MockContext();
    sendMessage = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('AudioContext', vi.fn(() => ctx));
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    player = new AudioPlayer();
  });

  afterEach(() => {
    player.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('applies volume set before the audio context exists', async () => {
    player.setVolume(0.4);
    await player.play(data, 0, 'mp3');
    expect(ctx.gain.gain.value).toBe(0.4);
  });

  it('promotes consecutive queued chunks and completes every chunk once', async () => {
    await player.play(data, 0, 'mp3');
    await player.scheduleNext(data, 1, 'mp3');
    expect(ctx.sources[1].start).toHaveBeenCalledWith(10);
    // Completion handlers can arrive slightly after the audio-clock boundary.
    ctx.currentTime = 10.1;
    ctx.sources[0].end();
    expect(player.getCurrentTime()).toBeCloseTo(0.1);
    await player.scheduleNext(data, 2, 'mp3');
    expect(ctx.sources[2].start).toHaveBeenCalledWith(20);
    ctx.currentTime = 20;
    ctx.sources[1].end();
    ctx.currentTime = 30;
    ctx.sources[2].end();
    ctx.sources[2].end();
    expect(sendMessage.mock.calls.map(([message]) => message)).toEqual([
      { type: MSG.CHUNK_COMPLETE, chunkIndex: 0 },
      { type: MSG.CHUNK_COMPLETE, chunkIndex: 1 },
      { type: MSG.CHUNK_COMPLETE, chunkIndex: 2 },
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves position and reschedules queued playback after speed changes', async () => {
    await player.play(data, 0, 'mp3');
    await player.scheduleNext(data, 1, 'mp3');
    ctx.currentTime = 2;
    player.setSpeed(2);
    expect(player.getCurrentTime()).toBe(2);
    expect(ctx.sources[1].stop).toHaveBeenCalledOnce();
    expect(ctx.sources[2].start).toHaveBeenCalledWith(6);
    ctx.currentTime = 3;
    expect(player.getCurrentTime()).toBe(4);
    ctx.sources[1].end();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('reschedules queued playback at the correct boundary after pausing', async () => {
    await player.play(data, 0, 'mp3');
    await player.scheduleNext(data, 1, 'mp3');
    ctx.currentTime = 3;
    player.pause();
    ctx.currentTime = 20;
    expect(player.getCurrentTime()).toBe(3);
    player.resume();
    expect(ctx.sources[2].start).toHaveBeenCalledWith(0, 3);
    expect(ctx.sources[3].start).toHaveBeenCalledWith(27);
    ctx.currentTime = 22;
    expect(player.getCurrentTime()).toBe(5);
  });

  it('keeps a chunk decoded during a pause queued until resume', async () => {
    await player.play(data, 0, 'mp3');
    let finishDecode!: (value: AudioBuffer) => void;
    ctx.decodeAudioData.mockImplementationOnce(() => new Promise((resolve) => { finishDecode = resolve; }));
    const scheduled = player.scheduleNext(data, 1, 'mp3');
    ctx.currentTime = 3;
    player.pause();
    finishDecode(buffer());
    await scheduled;
    expect(ctx.sources).toHaveLength(1);
    ctx.currentTime = 20;
    player.resume();
    expect(ctx.sources[2].start).toHaveBeenCalledWith(27);
  });

  it('starts a queued chunk if decoding finishes after the current chunk ends', async () => {
    await player.play(data, 0, 'mp3');
    let finishDecode!: (value: AudioBuffer) => void;
    ctx.decodeAudioData.mockImplementationOnce(() => new Promise((resolve) => { finishDecode = resolve; }));
    const scheduled = player.scheduleNext(data, 1, 'mp3');
    ctx.currentTime = 10;
    ctx.sources[0].end();
    finishDecode(buffer(4));
    await scheduled;
    expect(ctx.sources[1].start).toHaveBeenCalledWith(0, 0);
    expect(player.getDuration()).toBe(4);
    ctx.sources[1].end();
    expect(sendMessage).toHaveBeenLastCalledWith({ type: MSG.CHUNK_COMPLETE, chunkIndex: 1 });
  });

  it.each(['play', 'scheduleNext'] as const)('discards pending %s decoding after stop', async (operation) => {
    if (operation === 'scheduleNext') await player.play(data, 0, 'mp3');
    let finishDecode!: (value: AudioBuffer) => void;
    ctx.decodeAudioData.mockImplementationOnce(() => new Promise((resolve) => { finishDecode = resolve; }));
    const pending = player[operation](data, 1, 'mp3');
    player.stop();
    finishDecode(buffer());
    await pending;
    expect(ctx.sources).toHaveLength(operation === 'play' ? 0 : 1);
    expect(player.getDuration()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('discards an older queued decode when a newer chunk replaces it', async () => {
    await player.play(data, 0, 'mp3');
    let finishDecode!: (value: AudioBuffer) => void;
    ctx.decodeAudioData.mockImplementationOnce(() => new Promise((resolve) => { finishDecode = resolve; }));
    const stale = player.scheduleNext(data, 1, 'mp3');
    await player.scheduleNext(data, 2, 'mp3');
    finishDecode(buffer(99));
    await stale;
    expect(ctx.sources).toHaveLength(2);
    ctx.currentTime = 10;
    ctx.sources[0].end();
    ctx.sources[1].end();
    expect(sendMessage).toHaveBeenLastCalledWith({ type: MSG.CHUNK_COMPLETE, chunkIndex: 2 });
  });
});
