import { MSG, type ExtensionMessage } from '@shared/messages';

// No React, DOM extraction, observers or player code is loaded on unused pages.
const accepted = new Set<string>([
  MSG.GET_PAGE_INFO,
  MSG.EXTRACT_CONTENT,
  MSG.GET_CHUNK,
  MSG.GET_PAGE_URL,
  MSG.PLAYBACK_STATE_CHANGED,
  MSG.PLAYBACK_PROGRESS,
  MSG.CHUNK_COMPLETE,
  MSG.WORD_TIMING,
  MSG.PLAYBACK_ERROR,
  MSG.START_READING,
  MSG.STOP,
  MSG.FAILOVER_NOTICE,
  MSG.RESUME_FROM_PROGRESS,
  MSG.SHOW_TOOLBAR,
  MSG.RETURN_TO_READING,
]);
let runtime: Promise<typeof import('./runtime')> | undefined;
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, respond) => {
  if (!accepted.has(message.type)) return false;
  if (message.type === MSG.GET_PAGE_INFO && message.ping) {
    respond({ ok: true });
    return false;
  }
  runtime ??= import('./runtime');
  runtime
    .then((module) => module.handleMessage(message))
    .then(respond)
    .catch((error) => respond({ error: error instanceof Error ? error.message : String(error) }));
  return true;
});
