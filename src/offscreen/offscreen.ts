import { MSG, type ExtensionMessage } from '@shared/messages';
import { AudioPlayer } from './audio-player';

console.log('Immersive Reader: offscreen document loaded');

const player = new AudioPlayer();

// Convert base64 string back to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

chrome.runtime.onMessage.addListener(
  (message: ExtensionMessage, _sender, sendResponse) => {
    handleMessage(message).then(sendResponse).catch((err) => {
      sendResponse({ error: String(err) });
    });
    return true;
  },
);

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  switch (message.type) {
    case MSG.OFFSCREEN_PLAY: {
      const audioData = base64ToArrayBuffer(message.audioBase64);
      await player.play(audioData, message.chunkIndex, message.format);
      return { ok: true };
    }

    case MSG.OFFSCREEN_PAUSE:
      player.pause();
      return { ok: true };

    case MSG.OFFSCREEN_RESUME:
      player.resume();
      return { ok: true };

    case MSG.OFFSCREEN_STOP:
      player.stop();
      return { ok: true };

    case MSG.OFFSCREEN_SET_SPEED:
      player.setSpeed(message.speed);
      return { ok: true };

    case MSG.OFFSCREEN_SET_VOLUME:
      player.setVolume(message.volume);
      return { ok: true };

    default:
      // Ignore messages not meant for offscreen (e.g., content script messages)
      return { ok: true };
  }
}
