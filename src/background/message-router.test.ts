import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MSG } from '@shared/messages';
import { routeMessage } from './message-router';

// Use vi.hoisted so mock functions are available inside hoisted vi.mock factories
const {
  mockStartPlayback,
  mockStopPlayback,
  mockPausePlayback,
  mockResumePlayback,
  mockSkipForward,
  mockSkipBackward,
  mockSkipToChunk,
  mockSetSpeed,
  mockSetVolume,
  mockGetActiveTab,
  mockHandlePlaybackProgress,
  mockGetState,
  mockGetAllHealth,
  mockClearHealth,
  mockTabsQuery,
  mockTabsSendMessage,
  mockRuntimeSendMessage,
  mockRuntimeOpenOptionsPage,
} = vi.hoisted(() => ({
  mockStartPlayback: vi.fn(),
  mockStopPlayback: vi.fn(),
  mockPausePlayback: vi.fn(),
  mockResumePlayback: vi.fn(),
  mockSkipForward: vi.fn(),
  mockSkipBackward: vi.fn(),
  mockSkipToChunk: vi.fn(),
  mockSetSpeed: vi.fn(),
  mockSetVolume: vi.fn(),
  mockGetActiveTab: vi.fn(),
  mockHandlePlaybackProgress: vi.fn(),
  mockGetState: vi.fn(),
  mockGetAllHealth: vi.fn(),
  mockClearHealth: vi.fn(),
  mockTabsQuery: vi.fn(),
  mockTabsSendMessage: vi.fn(),
  mockRuntimeSendMessage: vi.fn(),
  mockRuntimeOpenOptionsPage: vi.fn(),
}));

vi.mock('./orchestrator', () => ({
  startPlayback: mockStartPlayback,
  stopPlayback: mockStopPlayback,
  pausePlayback: mockPausePlayback,
  resumePlayback: mockResumePlayback,
  skipForward: mockSkipForward,
  skipBackward: mockSkipBackward,
  skipToChunk: mockSkipToChunk,
  setSpeed: mockSetSpeed,
  setVolume: mockSetVolume,
  getActiveTab: mockGetActiveTab,
  handlePlaybackProgress: mockHandlePlaybackProgress,
}));

vi.mock('./playback-state', () => ({
  playbackState: { getState: mockGetState },
}));

vi.mock('./failover', () => ({
  getAllHealth: mockGetAllHealth,
  clearHealth: mockClearHealth,
}));

vi.mock('@providers/registry', () => ({
  getProvider: vi.fn(),
}));

vi.mock('@providers/elevenlabs', () => ({
  getElevenLabsUsage: vi.fn(),
}));

vi.mock('@shared/storage', () => ({
  getProviders: vi.fn(),
  setActiveProviderGroup: vi.fn(),
}));

vi.stubGlobal('chrome', {
  tabs: {
    query: mockTabsQuery,
    sendMessage: mockTabsSendMessage,
  },
  runtime: {
    sendMessage: mockRuntimeSendMessage,
    openOptionsPage: mockRuntimeOpenOptionsPage,
  },
});

describe('routeMessage', () => {
  const mockSender = {} as chrome.runtime.MessageSender;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('MSG.PLAY', () => {
    it('returns error when no active tab', async () => {
      mockTabsQuery.mockResolvedValue([]);

      const response = await new Promise<unknown>((resolve) => {
        routeMessage({ type: MSG.PLAY }, mockSender, resolve);
      });

      expect(response).toEqual({ error: 'No active tab' });
    });

    it('calls startPlayback with tab id and returns ok', async () => {
      mockTabsQuery.mockResolvedValue([{ id: 42 }]);
      mockStartPlayback.mockResolvedValue(undefined);

      const response = await new Promise<unknown>((resolve) => {
        routeMessage({ type: MSG.PLAY }, mockSender, resolve);
      });

      expect(mockStartPlayback).toHaveBeenCalledWith(42, undefined);
      expect(response).toEqual({ ok: true });
    });

    it('passes fromSelection flag to startPlayback', async () => {
      mockTabsQuery.mockResolvedValue([{ id: 42 }]);
      mockStartPlayback.mockResolvedValue(undefined);

      const response = await new Promise<unknown>((resolve) => {
        routeMessage({ type: MSG.PLAY, fromSelection: true }, mockSender, resolve);
      });

      expect(mockStartPlayback).toHaveBeenCalledWith(42, true);
      expect(response).toEqual({ ok: true });
    });

    it('returns error message when startPlayback throws', async () => {
      mockTabsQuery.mockResolvedValue([{ id: 42 }]);
      mockStartPlayback.mockRejectedValue(new Error('No provider'));

      const response = await new Promise<unknown>((resolve) => {
        routeMessage({ type: MSG.PLAY }, mockSender, resolve);
      });

      expect(response).toEqual({ error: 'No provider' });
    });

    it('returns stringified error when startPlayback throws non-Error', async () => {
      mockTabsQuery.mockResolvedValue([{ id: 42 }]);
      mockStartPlayback.mockRejectedValue('string-error');

      const response = await new Promise<unknown>((resolve) => {
        routeMessage({ type: MSG.PLAY }, mockSender, resolve);
      });

      expect(response).toEqual({ error: 'string-error' });
    });
  });

  describe('MSG.STOP', () => {
    it('calls stopPlayback and returns ok', async () => {
      mockGetActiveTab.mockReturnValue(null);

      const response = await new Promise<unknown>((resolve) => {
        routeMessage({ type: MSG.STOP }, mockSender, resolve);
      });

      expect(mockStopPlayback).toHaveBeenCalled();
      expect(response).toEqual({ ok: true });
    });

    it('forwards STOP to content script when active tab exists', async () => {
      mockGetActiveTab.mockReturnValue(42);
      mockTabsSendMessage.mockResolvedValue(undefined);

      await new Promise<unknown>((resolve) => {
        routeMessage({ type: MSG.STOP }, mockSender, resolve);
      });

      expect(mockTabsSendMessage).toHaveBeenCalledWith(42, { type: MSG.STOP });
    });
  });

  describe('MSG.PAUSE', () => {
    it('calls pausePlayback and returns ok', async () => {
      const response = await new Promise<unknown>((resolve) => {
        routeMessage({ type: MSG.PAUSE }, mockSender, resolve);
      });

      expect(mockPausePlayback).toHaveBeenCalled();
      expect(response).toEqual({ ok: true });
    });
  });

  describe('MSG.RESUME', () => {
    it('calls resumePlayback and returns ok', async () => {
      mockResumePlayback.mockResolvedValue(undefined);

      const response = await new Promise<unknown>((resolve) => {
        routeMessage({ type: MSG.RESUME }, mockSender, resolve);
      });

      expect(mockResumePlayback).toHaveBeenCalled();
      expect(response).toEqual({ ok: true });
    });
  });

  describe('MSG.GET_STATE', () => {
    it('returns current playback state', async () => {
      const mockState = { status: 'playing', currentChunkIndex: 3, totalChunks: 10 };
      mockGetState.mockReturnValue(mockState);

      const response = await new Promise<unknown>((resolve) => {
        routeMessage({ type: MSG.GET_STATE }, mockSender, resolve);
      });

      expect(response).toEqual(mockState);
    });
  });

  describe('MSG.SET_SPEED', () => {
    it('calls setSpeed with the provided speed', async () => {
      const response = await new Promise<unknown>((resolve) => {
        routeMessage({ type: MSG.SET_SPEED, speed: 1.5 }, mockSender, resolve);
      });

      expect(mockSetSpeed).toHaveBeenCalledWith(1.5);
      expect(response).toEqual({ ok: true });
    });
  });

  describe('MSG.SET_VOLUME', () => {
    it('calls setVolume with the provided volume', async () => {
      const response = await new Promise<unknown>((resolve) => {
        routeMessage({ type: MSG.SET_VOLUME, volume: 0.8 }, mockSender, resolve);
      });

      expect(mockSetVolume).toHaveBeenCalledWith(0.8);
      expect(response).toEqual({ ok: true });
    });
  });

  describe('MSG.SKIP_FORWARD', () => {
    it('calls skipForward and returns ok', async () => {
      mockSkipForward.mockResolvedValue(undefined);

      const response = await new Promise<unknown>((resolve) => {
        routeMessage({ type: MSG.SKIP_FORWARD }, mockSender, resolve);
      });

      expect(mockSkipForward).toHaveBeenCalled();
      expect(response).toEqual({ ok: true });
    });
  });

  describe('MSG.SKIP_BACKWARD', () => {
    it('calls skipBackward and returns ok', async () => {
      mockSkipBackward.mockResolvedValue(undefined);

      const response = await new Promise<unknown>((resolve) => {
        routeMessage({ type: MSG.SKIP_BACKWARD }, mockSender, resolve);
      });

      expect(mockSkipBackward).toHaveBeenCalled();
      expect(response).toEqual({ ok: true });
    });
  });

  describe('MSG.SEEK_TO_CHUNK', () => {
    it('calls skipToChunk with the provided chunk index', async () => {
      mockSkipToChunk.mockResolvedValue(undefined);

      const response = await new Promise<unknown>((resolve) => {
        routeMessage({ type: MSG.SEEK_TO_CHUNK, chunkIndex: 5 }, mockSender, resolve);
      });

      expect(mockSkipToChunk).toHaveBeenCalledWith(5);
      expect(response).toEqual({ ok: true });
    });
  });

  describe('unknown message type', () => {
    it('returns error for unknown message type', async () => {
      const response = await new Promise<unknown>((resolve) => {
        routeMessage({ type: 'UNKNOWN_TYPE' } as never, mockSender, resolve);
      });

      expect(response).toEqual({ error: 'Unknown message type' });
    });
  });

  describe('MSG.PLAYBACK_PROGRESS', () => {
    it('handles playback progress and relays to content script', async () => {
      mockGetActiveTab.mockReturnValue(42);
      mockHandlePlaybackProgress.mockReturnValue(undefined);
      mockTabsSendMessage.mockResolvedValue(undefined);

      const response = await new Promise<unknown>((resolve) => {
        routeMessage(
          { type: MSG.PLAYBACK_PROGRESS, currentTime: 1.5, duration: 3.0, chunkIndex: 2 },
          mockSender,
          resolve,
        );
      });

      expect(mockHandlePlaybackProgress).toHaveBeenCalledWith(1.5, 3.0, 2);
      expect(mockTabsSendMessage).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ type: MSG.PLAYBACK_PROGRESS, chunkIndex: 2 }),
      );
      expect(response).toEqual({ ok: true });
    });
  });

  describe('MSG.GET_PROVIDER_HEALTH', () => {
    it('returns health records', async () => {
      const mockHealth = { 'config-1': { status: 'healthy', failCount: 0 } };
      mockGetAllHealth.mockReturnValue(mockHealth);

      const response = await new Promise<unknown>((resolve) => {
        routeMessage({ type: MSG.GET_PROVIDER_HEALTH }, mockSender, resolve);
      });

      expect(response).toEqual(mockHealth);
    });
  });

  describe('MSG.RESET_PROVIDER_HEALTH', () => {
    it('clears health for the specified config', async () => {
      const response = await new Promise<unknown>((resolve) => {
        routeMessage(
          { type: MSG.RESET_PROVIDER_HEALTH, configId: 'config-1' },
          mockSender,
          resolve,
        );
      });

      expect(mockClearHealth).toHaveBeenCalledWith('config-1');
      expect(response).toEqual({ ok: true });
    });
  });
});
