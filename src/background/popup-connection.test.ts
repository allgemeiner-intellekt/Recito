import { expect, it, vi } from 'vitest';
import { connectPopup } from './popup-connection';
import { playbackState } from './playback-state';

it('pushes the current state on connect, pushes changes and stops on disconnect', () => {
  playbackState.reset();
  let disconnect = () => {};
  const postMessage = vi.fn();
  connectPopup({
    name: 'recito-popup',
    postMessage,
    onDisconnect: {
      addListener: (fn: () => void) => {
        disconnect = fn;
      },
    },
  } as unknown as chrome.runtime.Port);
  expect(postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({ state: expect.objectContaining({ status: 'idle' }) }),
  );
  playbackState.update({ status: 'error', error: { kind: 'network', chunkIndex: 3 } });
  expect(postMessage).toHaveBeenLastCalledWith(
    expect.objectContaining({
      state: expect.objectContaining({
        status: 'error',
        error: { kind: 'network', chunkIndex: 3 },
      }),
    }),
  );
  const calls = postMessage.mock.calls.length;
  disconnect();
  playbackState.reset();
  expect(postMessage).toHaveBeenCalledTimes(calls);
});

it('coalesces high-frequency progress updates to four pushes per second', () => {
  vi.useFakeTimers();
  playbackState.reset();
  const postMessage = vi.fn();
  let disconnect = () => {};
  connectPopup({
    name: 'recito-popup',
    postMessage,
    onDisconnect: {
      addListener: (fn: () => void) => {
        disconnect = fn;
      },
    },
  } as unknown as chrome.runtime.Port);
  playbackState.update({ status: 'playing' });
  const before = postMessage.mock.calls.length;
  for (let i = 0; i < 20; i++) playbackState.update({ currentTime: i, duration: 30 });
  expect(postMessage).toHaveBeenCalledTimes(before);
  vi.advanceTimersByTime(250);
  expect(postMessage).toHaveBeenCalledTimes(before + 1);
  expect(postMessage.mock.calls.at(-1)?.[0].state.currentTime).toBe(19);
  disconnect();
  vi.useRealTimers();
});
