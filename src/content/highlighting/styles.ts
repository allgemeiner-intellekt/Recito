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

/** Whether the page has light text, so the marker overlay must lighten instead of darken. */
export function isDarkPage(): boolean {
  const rgb = getComputedStyle(document.body).color.match(/\d+/g)?.map(Number);
  return !!rgb && rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 160;
}

/** Fills for the marker overlay, tuned for its multiply (light) or screen (dark) blending. */
export function overlayColors(
  settings: ResolvedHighlightSettings,
  darkPage: boolean,
): { word: string; sentence: string } {
  const sentenceAlpha =
    settings.style === 'sentence' ? (darkPage ? '0.36' : '0.34') : darkPage ? '0.24' : '0.2';
  return {
    word: darkPage ? settings.wordColor.replace(/0\.7\)$/, '0.55)') : settings.wordColor,
    sentence: settings.sentenceColor.replace(/0\.2\)$/, `${sentenceAlpha})`),
  };
}

// The word marker and sentence band are painted by MarkerOverlay; the
// ir-word/ir-sentence highlights only hold their ranges, except that the
// underline style still decorates the word natively.
function buildCSS(settings: ResolvedHighlightSettings): string {
  const underline = `underline solid ${settings.wordColor}`;
  return `
::highlight(ir-word) {
  text-decoration: ${settings.style === 'underline' ? underline : 'none'};
  text-decoration-thickness: 3px;
}

/* Scrub hover (interactive text navigation) */
::highlight(ir-scrub-hover) {
  background-color: rgba(0, 0, 0, 0.06);
}

/* Cursor when hovering over scrubbable text */
html.ir-scrub-active { cursor: pointer; }

/* Fallback mark element styles (no CSS Custom Highlight API) */
mark.ir-word-mark {
  background-color: transparent;
  color: inherit;
  padding: 0;
  margin: 0;
  text-decoration: ${underline};
  text-decoration-thickness: 3px;
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
