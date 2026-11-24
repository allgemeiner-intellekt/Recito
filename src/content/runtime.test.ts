// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { MSG } from '@shared/messages';
import { DEFAULT_SETTINGS } from '@shared/constants';

vi.mock('./mount', () => ({ mountToolbar: vi.fn() }));
vi.mock('./extraction/extractor', async () => {
  const { buildTextNodeMap } = await import('./extraction/dom-mapper');
  const { collectBlocks } = await import('./extraction/blocks');
  return {
    extractContent: () => {
      const article = document.querySelector('article')!;
      const textMap = buildTextNodeMap(document.body);
      const blocks = collectBlocks(textMap, { include: (node) => article.contains(node) });
      const textContent = blocks.map((b) => b.text).join('\n\n');
      return {
        title: 'Private title',
        include: (node: Text) => article.contains(node),
        blocks,
        textMap,
        textContent,
        wordCount: textContent.split(/\s+/).filter(Boolean).length,
        sourceElement: article,
      };
    },
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
});
it('seeks inside a selection and switches to page scope at the clicked text outside it', async () => {
  document.body.innerHTML = '<article><p>Outside passage.</p><p>Selected passage.</p></article>';
  vi.stubGlobal('CSS', { highlights: new Map() });
  vi.stubGlobal(
    'Highlight',
    class extends Set<Range> {
      priority = 0;
    },
  );
  const selected = document.querySelectorAll('p')[1].firstChild!;
  const outside = document.querySelector('p')!.firstChild!;
  const caret = vi.fn(() => ({ offsetNode: selected, offset: 2 }));
  Object.defineProperty(document, 'caretPositionFromPoint', { configurable: true, value: caret });
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({
          [key]: key === 'ir-settings' ? DEFAULT_SETTINGS : undefined,
        })),
        set: vi.fn().mockResolvedValue(undefined),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true }) },
  });
  const range = document.createRange();
  range.selectNodeContents(document.querySelectorAll('p')[1]);
  window.getSelection()!.removeAllRanges();
  window.getSelection()!.addRange(range);
  const { handleMessage } = await import('./runtime');
  const { useToolbarStore } = await import('./state/store');
  const selection = await handleMessage({ type: MSG.EXTRACT_CONTENT, fromSelection: true });
  expect(selection).toMatchObject({
    scope: { kind: 'selection', wordCount: 2 },
    excerpt: 'Selected passage.',
  });
  useToolbarStore.getState()._setPlaybackStatus('playing');
  selected.parentElement!.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }),
  );
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
    type: MSG.SEEK_TO_CHUNK,
    chunkIndex: 0,
  });
  useToolbarStore.getState()._setPlaybackStatus('playing');
  caret.mockReturnValue({ offsetNode: outside, offset: 2 });
  outside.parentElement!.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 }),
  );
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
    type: MSG.PLAY,
    fromSelection: false,
    startOffset: 2,
  });
  const page = await handleMessage({
    type: MSG.EXTRACT_CONTENT,
    fromSelection: false,
    startOffset: 2,
  });
  expect(page).toMatchObject({ scope: { kind: 'page' }, startChunk: 0 });
  await handleMessage({ type: MSG.STOP });
});

it('refreshes cached page text when skipping references is enabled or disabled', async () => {
  document.body.innerHTML =
    '<article><p>Main words.</p><h2>References</h2><p>Reference words.</p></article>';
  window.getSelection()?.removeAllRanges();
  vi.stubGlobal('CSS', { highlights: new Map() });
  vi.stubGlobal(
    'Highlight',
    class extends Set<Range> {
      priority = 0;
    },
  );
  let skip = false;
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({
          [key]:
            key === 'ir-settings'
              ? {
                  ...DEFAULT_SETTINGS,
                  playback: { ...DEFAULT_SETTINGS.playback, skipReferences: skip },
                }
              : undefined,
        })),
        set: vi.fn().mockResolvedValue(undefined),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true }) },
  });
  const { handleMessage } = await import('./runtime');
  const read = async () => {
    const response = (await handleMessage({ type: MSG.EXTRACT_CONTENT, fromSelection: false })) as {
      totalChunks: number;
    };
    const chunks = [];
    for (let i = 0; i < response.totalChunks; i++)
      chunks.push(
        ((await handleMessage({ type: MSG.GET_CHUNK, index: i })) as { text: string }).text,
      );
    return chunks.join(' ');
  };
  expect(await read()).toContain('Reference words');
  skip = true;
  expect(await read()).not.toContain('Reference words');
  skip = false;
  expect(await read()).toContain('Reference words');
  await handleMessage({ type: MSG.STOP });
});

it('re-extracts on replay when visibility, text, or DOM order changes', async () => {
  document.body.innerHTML =
    '<article><p>Main summer text.</p><details><summary>Appendix</summary><p>Hidden detail.</p></details></article>';
  window.getSelection()?.removeAllRanges();
  vi.stubGlobal('CSS', { highlights: new Map() });
  vi.stubGlobal(
    'Highlight',
    class extends Set<Range> {
      priority = 0;
    },
  );
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({
          [key]: key === 'ir-settings' ? DEFAULT_SETTINGS : undefined,
        })),
        set: vi.fn().mockResolvedValue(undefined),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true }) },
  });
  const { handleMessage } = await import('./runtime');
  const read = async () => {
    const response = (await handleMessage({ type: MSG.EXTRACT_CONTENT, fromSelection: false })) as {
      totalChunks: number;
      reused?: boolean;
    };
    const chunks = [];
    for (let i = 0; i < response.totalChunks; i++)
      chunks.push(
        ((await handleMessage({ type: MSG.GET_CHUNK, index: i })) as { text: string }).text,
      );
    await handleMessage({ type: MSG.STOP });
    return { text: chunks.join(' '), reused: response.reused === true };
  };
  expect(await read()).toEqual({ text: 'Main summer text. Appendix', reused: false });
  expect(await read()).toEqual({ text: 'Main summer text. Appendix', reused: true });
  document.querySelector('details')!.open = true;
  expect(await read()).toEqual({ text: 'Main summer text. Appendix Hidden detail.', reused: false });
  document.querySelector('p')!.firstChild!.nodeValue = 'Main winter text.';
  expect(await read()).toEqual({ text: 'Main winter text. Appendix Hidden detail.', reused: false });
  const article = document.querySelector('article')!;
  article.prepend(article.lastElementChild!);
  expect(await read()).toEqual({ text: 'Appendix Hidden detail. Main winter text.', reused: false });
  expect(await read()).toEqual({ text: 'Appendix Hidden detail. Main winter text.', reused: true });
});
