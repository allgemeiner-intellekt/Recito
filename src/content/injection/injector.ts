import { detectTextBlocks } from './detector';
import { createPlayButton, removeAllPlayButtons } from './play-button';
import { isGmail } from '../extraction/extractor';
import { useStore } from '../state/store';

let gmailObserver: MutationObserver | null = null;

export function injectPlayButtons(): void {
  if (isGmail()) {
    injectGmailButtons();
    return;
  }

  const blocks = detectTextBlocks();
  for (const block of blocks) {
    const btn = createPlayButton(() => {
      startPlaybackFromElement(block.element);
    });
    block.element.insertBefore(btn, block.element.firstChild);
  }
}

export function cleanupPlayButtons(): void {
  removeAllPlayButtons();
  if (gmailObserver) {
    gmailObserver.disconnect();
    gmailObserver = null;
  }
}

function injectGmailButtons(): void {
  // Inject into any existing email bodies
  injectGmailButtonsNow();

  // Watch for new email bodies being loaded
  gmailObserver = new MutationObserver(() => {
    // Debounce: wait for DOM to settle
    setTimeout(injectGmailButtonsNow, 500);
  });

  gmailObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function injectGmailButtonsNow(): void {
  const emailBodies = document.querySelectorAll('div.a3s.aiL, div.a3s');
  for (const body of emailBodies) {
    if (body.querySelector('.ir-play-btn')) continue; // Already injected
    const text = body.textContent?.trim() ?? '';
    if (text.split(/\s+/).length < 50) continue; // Too short

    const btn = createPlayButton(() => {
      startPlaybackFromElement(body);
    });
    body.insertBefore(btn, body.firstChild);
  }
}

function startPlaybackFromElement(element: Element): void {
  const text = element.textContent?.trim() ?? '';
  if (!text) return;

  useStore.getState().setPendingPlaybackElement(element);
  document.dispatchEvent(new CustomEvent('ir-start-playback'));
}
