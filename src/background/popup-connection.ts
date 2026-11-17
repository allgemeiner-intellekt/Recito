import { playbackState } from './playback-state';
import { MSG } from '@shared/messages';

export function connectPopup(port: chrome.runtime.Port): void {
  if (port.name !== 'recito-popup') return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastSent = 0;
  let lastKey = '';
  let disconnected = false;
  let unsubscribe = () => {};
  const cleanup = () => {
    disconnected = true;
    clearTimeout(timer);
    unsubscribe();
  };
  const send = () => {
    timer = undefined;
    if (disconnected) return;
    lastSent = Date.now();
    try {
      port.postMessage({ type: MSG.PLAYBACK_STATE_CHANGED, state: playbackState.getState() });
    } catch {
      cleanup();
    }
  };
  const changed = () => {
    const state = playbackState.getState();
    const key = JSON.stringify([
      state.status,
      state.error,
      state.tabId,
      state.currentChunkIndex,
      state.scope,
      state.voiceId,
      state.speed,
      state.volume,
      state.notice,
    ]);
    if (key !== lastKey) {
      lastKey = key;
      clearTimeout(timer);
      send();
    } else if (!timer) {
      const delay = Math.max(0, 250 - (Date.now() - lastSent));
      timer = setTimeout(send, delay);
    }
  };
  unsubscribe = playbackState.onStateChange(changed);
  port.onDisconnect.addListener(cleanup);
  changed();
}
