import { mountApp } from './mount';

// Don't inject into extension pages or about: pages
const url = window.location.href;
if (!url.startsWith('chrome://') && !url.startsWith('about:') && !url.startsWith('chrome-extension://')) {
  mountApp();
}
