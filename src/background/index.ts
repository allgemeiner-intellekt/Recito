import { ensureOffscreenDocument } from './offscreen-manager';
import { routeMessage } from './message-router';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  routeMessage(message, sender, sendResponse);
  return true; // keep channel open for async response
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('Immersive Reader installed');
});

// Pre-create offscreen document
ensureOffscreenDocument().catch(console.error);
