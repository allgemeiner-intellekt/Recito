import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('./offscreen-manager', () => ({ ensureOffscreenDocument: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./message-router', () => ({ routeMessage: vi.fn() }));
vi.mock('./playback-state', () => ({ playbackState: { onStateChange: vi.fn(), getStatus: () => 'idle' } }));
vi.mock('@shared/storage', () => ({ cleanOldProgress: vi.fn().mockResolvedValue(undefined),
  getActiveProvider: vi.fn(), getSettings: vi.fn().mockResolvedValue({ themeColor: null }) }));
vi.mock('./icon-renderer', () => ({ updateIcon: vi.fn() }));
vi.mock('./orchestrator', () => ({ startPlayback: vi.fn(), pausePlayback: vi.fn(), resumePlayback: vi.fn(),
  stopPlayback: vi.fn(), skipForward: vi.fn(), skipBackward: vi.fn(), getActiveTab: vi.fn(), ensureContentScript: vi.fn() }));

let ids: Set<string>;
let apiError: { message: string } | undefined;
let installed: ReturnType<typeof vi.fn>;
let create: ReturnType<typeof vi.fn>;
let removeAll: Mock<[() => void], void>;
let clicked: ReturnType<typeof vi.fn>;
let openOptions: ReturnType<typeof vi.fn>;
let failCreation: boolean;

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  ids = new Set(); apiError = undefined; failCreation = false;
  installed = vi.fn(); clicked = vi.fn(); openOptions = vi.fn();
  create = vi.fn((options, callback?: () => void) => {
    apiError = failCreation ? { message: 'API unavailable' } : ids.has(options.id) ? { message: 'Duplicate id' } : undefined;
    if (!apiError) ids.add(options.id);
    callback?.(); apiError = undefined;
    return options.id;
  });
  removeAll = vi.fn((callback: () => void) => { ids.clear(); callback(); });
  vi.stubGlobal('chrome', {
    runtime: { onMessage: { addListener: vi.fn() }, onInstalled: { addListener: installed },
      get lastError() { return apiError; }, getURL: (path: string) => `chrome-extension://test/${path}`, openOptionsPage: openOptions },
    tabs: { create: vi.fn() }, alarms: { onAlarm: { addListener: vi.fn() } },
    commands: { onCommand: { addListener: vi.fn() } }, action: { onClicked: { addListener: vi.fn() } },
    contextMenus: { create, removeAll, onClicked: { addListener: clicked } }, storage: { onChanged: { addListener: vi.fn() } },
  });
});

async function install(reason = 'update') {
  const listener = installed.mock.calls.at(-1)![0];
  await listener({ reason });
}

describe('background settings menu lifecycle', () => {
  it('does not recreate persistent menus on service worker restart', async () => {
    await import('./index');
    await install();
    expect(ids.has('ir-settings')).toBe(true);
    create.mockClear(); removeAll.mockClear();
    vi.resetModules(); await import('./index');
    expect(create).not.toHaveBeenCalled();
    expect(removeAll).not.toHaveBeenCalled();
  });

  it('recreates exactly one menu on repeated install/update events without a duplicate ID', async () => {
    ids.add('ir-settings');
    await import('./index');
    await install(); await install();
    expect(removeAll).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(2);
    expect([...ids]).toEqual(['ir-settings']);
  });

  it('handles create errors explicitly and preserves the settings action', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await import('./index');
    failCreation = true; await install();
    expect(error).toHaveBeenCalledWith(expect.any(String), 'API unavailable');
    clicked.mock.calls[0][0]({ menuItemId: 'ir-settings' });
    expect(openOptions).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
