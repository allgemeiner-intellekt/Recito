let creating: Promise<void> | null = null;

export async function ensureOffscreenDocument(): Promise<void> {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (existingContexts.length > 0) return;

  if (!creating) {
    creating = (async () => {
      try {
        await chrome.offscreen.createDocument({
          url: 'src/offscreen/offscreen.html',
          reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK, chrome.offscreen.Reason.BLOBS],
          justification: 'Playing TTS audio via Web Audio API',
        });
      } finally {
        creating = null;
      }
    })();
  }

  await creating;
}
