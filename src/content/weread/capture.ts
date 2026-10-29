import type { CapturedRun, WereadCapture } from './model';
import type { WereadCaptureRequest, WereadCaptureResponse } from '@shared/messages';

/** Retain the chapter's DOM geometry just before WeRead converts it to Canvas. */
export function installWereadCapture(): () => void {
  const original = Element.prototype.getBoundingClientRect;
  let seen = new WeakMap<Element, string>();
  let snapshot: WereadCapture = { url: location.href, runs: [], width: 0, captureMs: 0, truncated: false };
  let capturing = false;
  // Runtime imports can make CRXJS emit an async loader, missing the site's
  // initial layout. Keep this document_start MAIN-world entry self-contained.
  const requestType: WereadCaptureRequest['type'] = 'recito:weread:request';
  const responseType: WereadCaptureResponse<WereadCapture>['type'] = 'recito:weread:response';

  Element.prototype.getBoundingClientRect = function() {
    const rect = original.call(this);
    // The site's layout collector measures this temporary element after fonts
    // have loaded, before the DOM is removed. Other measurements pass through.
    if (!capturing && (this.id === 'preRenderContainer' || this.classList.contains('preRenderContainer')) && rect.width > 0) {
      capturing = true;
      try {
        const html = this.innerHTML;
        const key = `${location.href}:${rect.width}:${rect.height}:${html}`;
        if (seen.get(this) !== key) {
          // An empty or failed layout must not leave the previous chapter usable.
          // Only the latest element/layout can reuse the global snapshot.
          seen = new WeakMap();
          snapshot = { url: location.href, runs: [], width: rect.width, captureMs: 0, truncated: false };
          const start = performance.now();
          const runs: CapturedRun[] = [];
          const walker = document.createTreeWalker(this, NodeFilter.SHOW_TEXT);
          const range = document.createRange();
          let node: Node | null;
          let truncated = false;
          let pendingSpace = false;
          while ((node = walker.nextNode())) {
            const parent = node.parentElement;
            if (!parent || parent.closest('style, script, noscript, .chapterTitle, [data-wr-id="chapterTitle"]')) continue;
            const text = node.nodeValue ?? '';
            if (!text.trim()) continue;
            for (let offset = 0; offset < text.length;) {
              const character = String.fromCodePoint(text.codePointAt(offset)!);
              range.setStart(node, offset);
              range.setEnd(node, offset + character.length);
              const box = range.getBoundingClientRect();
              if (box.width > 0 && box.height > 0) {
                runs.push({ text: character, x: box.left - rect.left, y: box.top - rect.top,
                  width: box.width, height: box.height, baseline: box.top - rect.top + box.height / 2,
                  ...(pendingSpace ? { spaceBefore: true } : {}) });
                pendingSpace = false;
              } else if (/\s/.test(character)) pendingSpace = true;
              offset += character.length;
              if (runs.length >= 50000) { truncated = true; break; }
            }
            if (truncated) break;
          }
          snapshot = { url: location.href, runs, width: rect.width, captureMs: performance.now() - start, truncated };
          if (runs.length > 0) seen.set(this, key);
        }
      } catch {
        seen = new WeakMap();
        snapshot = { url: location.href, runs: [], width: 0, captureMs: 0, truncated: false };
        // Never interrupt the site's layout if capture fails.
      } finally {
        capturing = false;
      }
    }
    return rect;
  };

  const onRequest = () => {
    const response: WereadCaptureResponse<WereadCapture> = { type: responseType, payload: snapshot };
    document.dispatchEvent(new CustomEvent(responseType, { detail: JSON.stringify(response) }));
  };
  document.addEventListener(requestType, onRequest);
  return () => {
    Element.prototype.getBoundingClientRect = original;
    document.removeEventListener(requestType, onRequest);
  };
}
