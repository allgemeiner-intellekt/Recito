// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { Popup } from '../popup/Popup';
import { FloatingToolbar } from '../content/player/FloatingToolbar';
import { Onboarding } from '../onboarding/Onboarding';
import { Options } from '../options/Options';
import { useToolbarStore } from '../content/state/store';
import { MSG } from '@shared/messages';
import { DEFAULT_SETTINGS } from '@shared/constants';
import type { PlaybackState } from '@shared/types';

vi.mock('@shared/useTheme', () => ({ useTheme: vi.fn() }));
let data: Record<string, unknown>;
let container: HTMLDivElement;
let root: Root;
let receive: (message: { state: PlaybackState }) => void;
const initial: PlaybackState = {
  status: 'idle',
  currentChunkIndex: 0,
  totalChunks: 4,
  chunkProgress: 0,
  currentTime: 0,
  duration: 0,
  speed: 1,
  volume: 1,
  tabId: 7,
  scope: { kind: 'page', wordCount: 200 },
  excerpt: 'A voice sets a pace.',
  providerName: 'OpenAI',
  providerId: 'openai',
};
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
  data = {
    'ir-settings': { ...DEFAULT_SETTINGS, activeProviderGroup: 'openai', activeVoiceId: 'alloy' },
    'ir-providers': [
      { id: 'key', providerId: 'openai', name: 'My key', apiKey: 'fixture-not-a-real-key' },
    ],
  };
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: structuredClone(data[key]) })),
        set: vi.fn(async (values) => {
          Object.assign(data, structuredClone(values));
        }),
      },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: {
      connect: () => ({
        onMessage: {
          addListener: (fn: typeof receive) => {
            receive = fn;
          },
          removeListener: vi.fn(),
        },
        disconnect: vi.fn(),
      }),
      sendMessage: vi.fn(async (message) => {
        if ((message as { type?: string })?.type === MSG.GET_PAGE_INFO)
          return {
            scope: { kind: 'selection', wordCount: 60 },
            wordCount: 60,
            excerpt: 'Selected words to listen to.',
            readable: true,
            title: 'PRIVATE PAGE TITLE',
          };
        if ((message as { type?: string })?.type === MSG.LIST_VOICES)
          return [{ id: 'alloy', name: 'Alloy' }];
        if ((message as { type?: string })?.type === MSG.GET_PROVIDER_HEALTH) return {};
        if ((message as { type?: string })?.type === MSG.TEST_KEY) return { ok: false };
        return { ok: true };
      }),
      getURL: (path: string) => 'chrome-extension://test/' + path,
    },
    tabs: {
      query: vi.fn(async () => [{ id: 7, title: 'PRIVATE PAGE TITLE' }]),
      get: vi.fn(async () => ({ title: 'The other article' })),
      create: vi.fn(),
      update: vi.fn(async () => ({})),
    },
  });
  useToolbarStore.setState({
    toolbarVisible: true,
    expanded: false,
    toastMessage: null,
    snapshot: { ...initial, status: 'playing' },
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function render(component: React.ReactNode) {
  await act(async () => root.render(component));
}
function button(name: string) {
  return [...container.querySelectorAll('button')].find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === name,
  )!;
}
async function click(name: string) {
  expect(button(name), name).toBeTruthy();
  await act(async () => button(name).click());
}
async function value(input: HTMLInputElement, text: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function state(partial: Partial<PlaybackState>) {
  await act(async () => receive({ state: { ...initial, ...partial } }));
}
it('confirms selection scope, focuses Listen to selection and can start the whole page', async () => {
  await render(React.createElement(Popup));
  expect(container.textContent).toContain('Selected text');
  expect(container.textContent).toContain('Selected words to listen to.');
  expect(container.textContent).not.toContain('PRIVATE PAGE TITLE');
  expect(document.activeElement).toBe(button('Listen to selection'));
  await click('Read the whole page instead');
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
    type: MSG.PLAY,
    fromSelection: false,
    startChunk: 0,
  });
});
it.each(['loading', 'playing', 'paused', 'error'] as const)(
  'renders popup %s state from background pushes',
  async (status) => {
    await render(React.createElement(Popup));
    await state({
      status,
      error: status === 'error' ? { kind: 'network', chunkIndex: 2 } : undefined,
    });
    if (status === 'loading') expect(container.textContent).toContain('Preparing your voice');
    if (status === 'playing') expect(button('Pause')).toBeTruthy();
    if (status === 'paused') expect(button('Resume')).toBeTruthy();
    if (status === 'error') {
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        "Can't reach OpenAI",
      );
      await click('Try again');
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: MSG.RETRY });
    }
  },
);
it('names only the other tab when playback is elsewhere', async () => {
  await render(React.createElement(Popup));
  await state({ status: 'playing', tabId: 8 });
  expect(container.textContent).toContain('Reading in another tab');
  expect(container.textContent).toContain('The other article');
  expect(button('Go to that tab')).toBeTruthy();
});
it('offers setup with no provider and explains an unreadable page', async () => {
  data['ir-providers'] = [];
  await render(React.createElement(Popup));
  expect(button('Set up Recito')).toBeTruthy();
});
it('shows page Listen and saved-position Resume actions', async () => {
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message) => {
    if ((message as { type?: string })?.type === MSG.GET_PAGE_INFO)
      return {
        scope: { kind: 'page', wordCount: 200 },
        wordCount: 200,
        excerpt: 'Page opening',
        readable: true,
        savedChunk: 2,
      };
    if ((message as { type?: string })?.type === MSG.LIST_VOICES)
      return [{ id: 'alloy', name: 'Alloy' }];
    return {};
  });
  await render(React.createElement(Popup));
  expect(container.textContent).toContain('Resume ·');
  await click('Start from the top');
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
    type: MSG.PLAY,
    fromSelection: true,
    startChunk: 0,
  });
});
it('gives a plain explanation on unreadable pages', async () => {
  vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ error: 'Cannot read chrome://' });
  await render(React.createElement(Popup));
  expect(container.textContent).toContain("This page can't be read");
});
it('offers Listen on a whole page without a saved position', async () => {
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message) =>
    (message as { type?: string })?.type === MSG.GET_PAGE_INFO
      ? {
          scope: { kind: 'page', wordCount: 200 },
          wordCount: 200,
          excerpt: 'Page opening',
          readable: true,
        }
      : [],
  );
  await render(React.createElement(Popup));
  expect(button('Listen')).toBeTruthy();
});
it('keeps Escape inside the player, opens the panel, and explains unavailable speed', async () => {
  data['ir-settings'] = { ...DEFAULT_SETTINGS, activeProviderGroup: 'mimo' };
  data['ir-providers'] = [{ id: 'key', providerId: 'mimo', name: 'MiMo', apiKey: 'fixture' }];
  useToolbarStore.setState({ snapshot: { ...initial, status: 'playing', providerId: 'mimo' } });
  await render(React.createElement(FloatingToolbar));
  await click('Player settings');
  expect(container.textContent).toContain('Xiaomi MiMo does not support speed control.');
  expect(button('Increase speed').disabled).toBe(true);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(useToolbarStore.getState().expanded).toBe(true);
  await act(async () =>
    button('Player settings').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    ),
  );
  expect(useToolbarStore.getState().expanded).toBe(false);
});
it('uses the same error wording and retry action in the rail', async () => {
  useToolbarStore.setState({
    snapshot: { ...initial, status: 'error', error: { kind: 'network', chunkIndex: 2 } },
  });
  await render(React.createElement(FloatingToolbar));
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Can't reach OpenAI");
  await click('Try again');
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: MSG.RETRY });
});
it('requires inline removal confirmation and retains keys when reset', async () => {
  await render(React.createElement(Options));
  await click('Remove');
  expect((data['ir-providers'] as unknown[]).length).toBe(1);
  await click('Keep');
  await click('Data');
  await click('Reset…');
  await click('Confirm reset');
  expect((data['ir-providers'] as unknown[]).length).toBe(1);
  expect(data['ir-settings']).toMatchObject({ activeProviderGroup: 'openai' });
});
it('persists ink, style, placement and icon behaviour immediately', async () => {
  await render(React.createElement(Options));
  await click('Appearance');
  await act(async () => container.querySelector<HTMLInputElement>('input[value="rose"]')!.click());
  await click('Underline');
  expect(data['ir-settings']).toMatchObject({ ink: 'rose', highlightStyle: 'underline' });
  await click('Playback');
  await click('Left margin');
  await click('Starts reading');
  expect(data['ir-settings']).toMatchObject({ playerPosition: 'rail-left', iconClick: 'read' });
});
it('blocks empty keys, explains failed tests and offers Save anyway in the shared form', async () => {
  await render(React.createElement(Options));
  await click('Add a key');
  expect(button('Test and save').disabled).toBe(true);
  await value(container.querySelector('input[type="password"]')!, 'new-fixture-key');
  await act(async () =>
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(container.textContent).toContain('The provider did not accept this key');
  await click('Save anyway');
  expect((data['ir-providers'] as unknown[]).length).toBe(2);
});
it('keeps setup on connect after a failed test and marks complete on explicit skip', async () => {
  await render(React.createElement(Onboarding));
  await value(container.querySelector('input[type="password"]')!, 'fixture');
  await act(async () =>
    container
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
  );
  expect(container.textContent).toContain("Couldn't connect");
  expect(container.querySelector('[aria-current="step"]')?.textContent).toContain(
    'Connect a provider',
  );
  expect(button('Save anyway')).toBeUndefined();
  await click('Skip for now');
  expect(data['ir-settings']).toMatchObject({ onboardingComplete: true });
});

it('does not mutate displayed text for progress updates whose displayed strings are unchanged', async () => {
  await render(React.createElement(FloatingToolbar));
  const records: MutationRecord[] = [];
  const observer = new MutationObserver((batch) => records.push(...batch));
  observer.observe(container, { characterData: true, subtree: true });
  await act(async () =>
    useToolbarStore.getState()._syncPlaybackState({
      ...initial,
      status: 'playing',
      currentTime: 0.1,
      chunkProgress: 0.01,
      elapsedSeconds: 0.1,
    }),
  );
  await Promise.resolve();
  expect(records).toEqual([]);
  observer.disconnect();
});

it.each([
  ['healthy', 'Ready'],
  ['cooldown', 'Resting'],
  ['failed', 'Refused'],
] as const)('shows %s key health in words', async (status, label) => {
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message) => {
    const type = (message as { type?: string })?.type;
    if (type === MSG.GET_PROVIDER_HEALTH)
      return {
        key: {
          status,
          failCount: 1,
          cooldownUntil: Date.now() + 60000,
          lastError: { message: 'Key refused by provider', status: 401, timestamp: Date.now() },
        },
      };
    if (type === MSG.LIST_VOICES) return [{ id: 'alloy', name: 'Alloy' }];
    return {};
  });
  await render(React.createElement(Options));
  expect(container.textContent).toContain(label);
  if (status === 'failed') expect(container.textContent).toContain('Key refused by provider');
});
it('keeps retired configurations visible and removable without offering editing', async () => {
  data['ir-providers'] = [
    { id: 'retired', providerId: 'groq', name: 'Old account', apiKey: 'saved-key' },
  ];
  await render(React.createElement(Options));
  expect(container.textContent).toContain('This provider is no longer supported');
  expect(button('Edit')).toBeUndefined();
  await click('Remove');
  await click('Confirm remove');
  expect(data['ir-providers']).toEqual([]);
});

it.each(['popup', 'player'] as const)(
  'keeps %s controls on the session provider after default-provider changes',
  async (surface) => {
    data['ir-settings'] = {
      ...DEFAULT_SETTINGS,
      activeProviderGroup: 'mimo',
      activeVoiceId: 'Mia',
    };
    data['ir-providers'] = [
      { id: 'key', providerId: 'openai', name: 'Reading key', apiKey: 'fixture' },
      { id: 'mimo-key', providerId: 'mimo', name: 'MiMo default', apiKey: 'fixture' },
    ];
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(async (message) => {
      const m = message as { type?: string; providerId?: string };
      if (m.type === MSG.GET_PAGE_INFO)
        return {
          scope: { kind: 'page', wordCount: 200 },
          wordCount: 200,
          readable: true,
          excerpt: 'Page opening.',
        };
      if (m.type === MSG.LIST_VOICES)
        return m.providerId === 'key'
          ? [{ id: 'alloy', name: 'Alloy' }]
          : [{ id: 'Mia', name: 'Mia' }];
      return {};
    });
    const session = {
      ...initial,
      status: 'playing' as const,
      providerId: 'openai',
      providerGroup: 'openai',
      configId: 'key',
      voiceId: 'alloy',
    };
    if (surface === 'popup') {
      await render(React.createElement(Popup));
      await state(session);
    } else {
      useToolbarStore.setState({ snapshot: session });
      await render(React.createElement(FloatingToolbar));
      await click('Player settings');
    }
    const select = container.querySelector('select')!;
    expect([...select.options].map((option) => option.text)).toEqual(['Alloy']);
    expect(select.value).toBe('alloy');
    expect(button('Increase speed').disabled).toBe(false);
    await click('Increase speed');
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: MSG.SET_SPEED, speed: 1.25 });
    expect(data['ir-settings']).toMatchObject({
      activeProviderGroup: 'mimo',
      activeVoiceId: 'Mia',
    });
  },
);

it('routes in-page setup through runtime messaging without requiring the Tabs API', async () => {
  data['ir-providers'] = [];
  vi.stubGlobal('chrome', { ...chrome, tabs: undefined });
  useToolbarStore.setState({
    snapshot: {
      ...initial,
      status: 'error',
      providerId: undefined,
      error: { kind: 'no-provider', chunkIndex: 0 },
    },
  });
  await render(React.createElement(FloatingToolbar));
  await click('Set up Recito');
  expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: MSG.OPEN_SETUP });
});
