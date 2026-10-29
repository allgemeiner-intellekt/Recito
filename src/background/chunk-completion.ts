import { MSG, type ExtensionMessage } from '@shared/messages';

// Register before playback starts and release both listeners on every exit path.
export function waitForChunkComplete(chunkIndex: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const finish = () => {
      chrome.runtime.onMessage.removeListener(listener);
      signal?.removeEventListener('abort', finish);
      resolve();
    };
    const listener = (message: ExtensionMessage) => {
      if (
        (message.type === MSG.CHUNK_COMPLETE || message.type === MSG.PLAYBACK_ERROR) &&
        message.chunkIndex === chunkIndex
      ) finish();
    };

    chrome.runtime.onMessage.addListener(listener);
    signal?.addEventListener('abort', finish, { once: true });
  });
}
