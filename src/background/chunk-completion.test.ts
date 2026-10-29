import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MSG, type ExtensionMessage } from '@shared/messages';
import { waitForChunkComplete } from './chunk-completion';

describe('chunk completion lifetime', () => {
  const listeners = new Set<(message: ExtensionMessage) => void>();
  beforeEach(() => {
    listeners.clear();
    vi.stubGlobal('chrome', { runtime: { onMessage: {
      addListener: (listener: (message: ExtensionMessage) => void) => listeners.add(listener),
      removeListener: (listener: (message: ExtensionMessage) => void) => listeners.delete(listener),
    } } });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it.each([MSG.CHUNK_COMPLETE, MSG.PLAYBACK_ERROR] as const)('cleans up both listeners on %s', async (type) => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const done = waitForChunkComplete(2, controller.signal);
    for (const listener of listeners) listener({ type, chunkIndex: 1, error: 'failed' });
    expect(listeners.size).toBe(1);
    for (const listener of listeners) listener({ type, chunkIndex: 2, error: 'failed' });
    await done;
    expect(listeners.size).toBe(0);
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('releases a pending wait on cancellation and skips already aborted work', async () => {
    const controller = new AbortController();
    const done = waitForChunkComplete(0, controller.signal);
    controller.abort();
    await done;
    expect(listeners.size).toBe(0);
    await waitForChunkComplete(0, controller.signal);
    expect(listeners.size).toBe(0);
  });
});
