import type { ResolvedHighlightSettings } from '@shared/types';

const STYLE_ID = 'ir-highlight-styles';

/**
 * Inject a <style> element with highlight CSS rules.
 * Includes both CSS Custom Highlight API pseudo-elements and fallback mark classes.
 */
export function injectHighlightStyles(settings: ResolvedHighlightSettings): HTMLStyleElement {
  // Remove existing style if present
  const existing = document.getElementById(STYLE_ID);
  if (existing) existing.remove();

  const styleEl = document.createElement('style');
  styleEl.id = STYLE_ID;
  styleEl.textContent = buildCSS(settings);
  document.head.appendChild(styleEl);
  return styleEl;
}

/**
 * Update the CSS within an existing style element when settings change.
 */
export function updateHighlightStyles(
  styleEl: HTMLStyleElement,
  settings: ResolvedHighlightSettings,
): void {
  styleEl.textContent = buildCSS(settings);
}

/**
 * Remove the injected style element.
 */
export function removeHighlightStyles(styleEl: HTMLStyleElement): void {
  styleEl.remove();
}

function buildCSS(settings: ResolvedHighlightSettings): string {
  const underline = settings.style === 'underline';
  const rgb = getComputedStyle(document.body).color.match(/\d+/g)?.map(Number);
  const darkPage = rgb && rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 160;
  const wordBackground = underline
    ? 'transparent'
    : darkPage
      ? settings.wordColor.replace(/0\.7\)$/, '1)')
      : settings.wordColor;
  const sentenceBackground =
    settings.style === 'sentence'
      ? settings.sentenceColor.replace(/0\.2\)$/, '0.34)')
      : settings.sentenceColor;
  const wordText = darkPage && !underline ? '#1e1b17' : 'inherit';

  return `
/* CSS Custom Highlight API styles */
::highlight(ir-word) {
  color: ${wordText};
  background-color: ${wordBackground};
  text-decoration: ${underline ? `underline solid ${settings.wordColor}` : 'none'};
  text-decoration-thickness: 3px;
}
::highlight(ir-sentence) {
  background-color: ${sentenceBackground};
}

/* Scrub hover (interactive text navigation) */
::highlight(ir-scrub-hover) {
  background-color: rgba(0, 0, 0, 0.06);
}

/* Cursor when hovering over scrubbable text */
html.ir-scrub-active { cursor: pointer; }

/* Fallback mark element styles */
mark.ir-word-mark {
  background-color: ${wordBackground};
  color: ${wordText};
  padding: 0 1px;
  margin: 0;
  border-radius: 3px;
  text-decoration: ${underline ? `underline solid ${settings.wordColor}` : 'none'};
  text-decoration-thickness: 3px;
  transition: background-color 0.15s ease;
}
mark.ir-sentence-mark {
  background-color: ${sentenceBackground};
  color: inherit;
  padding: 0;
  margin: 0;
  border-radius: 3px;
}
mark.ir-scrub-hover-mark {
  background-color: rgba(0, 0, 0, 0.06);
  color: inherit;
  padding: 0;
  margin: 0;
  border-radius: 3px;
}
`;
}
