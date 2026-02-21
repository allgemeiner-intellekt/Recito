const OFFSCREEN_URL = chrome.runtime.getURL('src/offscreen/offscreen.html')

export async function ensureOffscreen(): Promise<void> {
  // @ts-expect-error chrome.offscreen typing may be missing depending on @types/chrome version
  const has = (await chrome.offscreen?.hasDocument?.()) as boolean | undefined
  if (has) return

  // @ts-expect-error chrome.offscreen typing may be missing depending on @types/chrome version
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Play TTS audio reliably even on strict CSP pages.'
  })
}

