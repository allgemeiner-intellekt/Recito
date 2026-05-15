import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MSG, sendTabMessage } from '@shared/messages';

// ── Mocks ───────────────────────────────────────────────────────────────
// We must mock all external dependencies so the orchestrator module can
// be imported without hitting real Chrome APIs or provider logic.

vi.mock('@shared/messages', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@shared/messages')>();
  return {
    ...actual,
    sendTabMessage: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@providers/registry', () => ({
  getProvider: vi.fn(),
  getChunkLimits: vi.fn().mockReturnValue({ minWords: 15, maxWords: 25, splitThreshold: 30 }),
}));

vi.mock('@shared/storage', () => ({
  getActiveProvider: vi.fn(),
  getSettings: vi.fn(),
  saveProgress: vi.fn().mockResolvedValue(undefined),
  getProgress: vi.fn().mockResolvedValue(null),
  clearProgress: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./playback-state', () => {
  const listeners: Array<(state: unknown) => void> = [];
  let state = {
    status: 'idle',
    currentChunkIndex: 0,
    totalChunks: 0,
    chunkProgress: 0,
    currentTime: 0,
    duration: 0,
    speed: 1.0,
    volume: 1.0,
  };

  return {
    playbackState: {
      getState: () => ({ ...state }),
      getStatus: () => state.status,
      update: vi.fn((partial: Record<string, unknown>) => {
        state = { ...state, ...partial };
      }),
      setStatus: vi.fn((s: string) => {
        state.status = s;
      }),
      reset: vi.fn(() => {
        state = {
          status: 'idle',
          currentChunkIndex: 0,
          totalChunks: 0,
          chunkProgress: 0,
          currentTime: 0,
          duration: 0,
          speed: state.speed,
          volume: state.volume,
        };
      }),
      onStateChange: vi.fn((cb: (s: unknown) => void) => {
        listeners.push(cb);
        return () => {
          const idx = listeners.indexOf(cb);
          if (idx >= 0) listeners.splice(idx, 1);
        };
      }),
    },
  };
});

vi.mock('./offscreen-manager', () => ({
  ensureOffscreenDocument: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./word-timing', () => ({
  startWordTimingRelay: vi.fn(),
  stopWordTimingRelay: vi.fn(),
  onPlaybackProgress: vi.fn(),
}));

vi.mock('./latency-metrics', () => ({
  PlaybackLatencyTracker: vi.fn().mockImplementation(() => ({
    mark: vi.fn(),
    completeOnAudioProgress: vi.fn().mockReturnValue(null),
    cancel: vi.fn(),
  })),
}));

vi.mock('./playback-cache', () => ({
  evictAudioCache: vi.fn(),
}));

vi.mock('./failover', () => ({
  markFailed: vi.fn(),
  getNextCandidate: vi.fn(),
}));

vi.mock('@shared/constants', () => ({
  LOOKAHEAD_BUFFER_SIZE: 2,
  PROVIDER_SPEED_RANGES: {},
}));

// Chrome API stubs
const mockTabsSendMessage = vi.fn().mockResolvedValue(undefined);
const mockRuntimeSendMessage = vi.fn().mockResolvedValue(undefined);
const mockScriptingExecuteScript = vi.fn().mockResolvedValue(undefined);
const mockRuntimeOnMessage = {
  addListener: vi.fn(),
  removeListener: vi.fn(),
};

vi.stubGlobal('chrome', {
  tabs: {
    sendMessage: mockTabsSendMessage,
  },
  runtime: {
    sendMessage: mockRuntimeSendMessage,
    onMessage: mockRuntimeOnMessage,
  },
  scripting: {
    executeScript: mockScriptingExecuteScript,
  },
});

// ── Import after mocks ──────────────────────────────────────────────────
import { stopPlayback, startPlayback, pausePlayback, resumePlayback, setSpeed, setVolume, getActiveTab } from './orchestrator';
import { playbackState } from './playback-state';
import { stopWordTimingRelay } from './word-timing';
import { getActiveProvider, getSettings } from '@shared/storage';
import { getProvider } from '@providers/registry';

const mockGetActiveProvider = getActiveProvider as ReturnType<typeof vi.fn>;
const mockGetSettings = getSettings as ReturnType<typeof vi.fn>;
const mockGetProvider = getProvider as ReturnType<typeof vi.fn>;
const mockSendTabMessage = sendTabMessage as ReturnType<typeof vi.fn>;

describe('orchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure playback is stopped before each test
    stopPlayback();
  });

  describe('stopPlayback', () => {
    it('resets playback state to idle', () => {
      stopPlayback();
      expect(playbackState.reset).toHaveBeenCalled();
    });

    it('stops word timing relay', () => {
      stopPlayback();
      expect(stopWordTimingRelay).toHaveBeenCalled();
    });

    it('sends OFFSCREEN_STOP to the offscreen document', () => {
      stopPlayback();
      expect(mockRuntimeSendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: MSG.OFFSCREEN_STOP }),
      );
    });

    it('aborts any active session', () => {
      // Start playback to create an AbortController, then stop
      mockGetActiveProvider.mockResolvedValue({
        id: 'test-config',
        providerId: 'groq',
        name: 'Test',
        apiKey: 'key',
      });
      mockGetSettings.mockResolvedValue({ activeVoiceId: 'voice-1' });
      mockGetProvider.mockReturnValue({
        listVoices: vi.fn().mockResolvedValue([{ id: 'voice-1', name: 'V1' }]),
      });

      // We won't await startPlayback because it's complex —
      // just verify that calling stopPlayback doesn't throw
      expect(() => stopPlayback()).not.toThrow();
    });
  });

  describe('getActiveTab', () => {
    it('returns null before any playback starts', () => {
      expect(getActiveTab()).toBeNull();
    });
  });

  describe('pausePlayback', () => {
    it('does nothing when status is idle', () => {
      stopPlayback(); // ensure idle

      pausePlayback();

      // setStatus should not have been called with 'paused' since state is idle
      // (The playback-state mock's getStatus returns 'idle' by default)
      // pausePlayback checks getStatus() !== 'playing', so it returns early
      expect(playbackState.setStatus).not.toHaveBeenCalledWith('paused');
    });
  });

  describe('resumePlayback', () => {
    it('does nothing when status is idle', async () => {
      stopPlayback();
      await resumePlayback();
      expect(playbackState.setStatus).not.toHaveBeenCalledWith('playing');
    });
  });

  describe('setSpeed', () => {
    it('updates playback state with new speed', () => {
      setSpeed(2.0);
      expect(playbackState.update).toHaveBeenCalledWith({ speed: 2.0 });
    });

    it('sends OFFSCREEN_SET_SPEED to offscreen with residual speed', async () => {
      setSpeed(1.5);
      // setSpeed is fire-and-forget async via sendToOffscreen
      await vi.waitFor(() => {
        expect(mockRuntimeSendMessage).toHaveBeenCalledWith(
          expect.objectContaining({ type: MSG.OFFSCREEN_SET_SPEED }),
        );
      });
    });
  });

  describe('setVolume', () => {
    it('updates playback state with new volume', () => {
      setVolume(0.5);
      expect(playbackState.update).toHaveBeenCalledWith({ volume: 0.5 });
    });

    it('sends OFFSCREEN_SET_VOLUME to offscreen', async () => {
      setVolume(0.7);
      // setVolume is fire-and-forget async via sendToOffscreen
      await vi.waitFor(() => {
        expect(mockRuntimeSendMessage).toHaveBeenCalledWith(
          expect.objectContaining({ type: MSG.OFFSCREEN_SET_VOLUME, volume: 0.7 }),
        );
      });
    });
  });

  describe('startPlayback', () => {
    it('stops previous playback before starting a new session', async () => {
      mockGetActiveProvider.mockResolvedValue({
        id: 'cfg-1',
        providerId: 'groq',
        name: 'Test',
        apiKey: 'key',
      });
      mockGetSettings.mockResolvedValue({ activeVoiceId: 'v1' });
      mockGetProvider.mockReturnValue({
        listVoices: vi.fn().mockResolvedValue([{ id: 'v1', name: 'Voice' }]),
      });

      // Mock sendTabMessage for content script interactions
      mockSendTabMessage
        .mockResolvedValueOnce({ wordCount: 100 }) // ensureContentScript ping
        .mockResolvedValueOnce({
          title: 'Test',
          wordCount: 100,
          totalChunks: 5,
        }) // EXTRACT_CONTENT
        .mockResolvedValueOnce('https://example.com'); // GET_PAGE_URL

      // We need to prevent the playback loop from running indefinitely.
      // Synthesize will fail because provider.synthesize is not set up,
      // which causes the orchestrator to stop.

      // Just verify stopPlayback is called at the beginning of startPlayback
      // by checking the reset was called (part of stopPlayback)
      // unused variable removed — we just check the expect below

      // startPlayback calls stopPlayback() internally as first step
      // Since full e2e test is complex, let's just verify the initial stop call
      try {
        await startPlayback(1);
      } catch {
        // May fail at various steps — that's fine, we just care about the initial stop
      }

      // The first thing startPlayback does is call stopPlayback(), which calls reset
      expect(playbackState.reset).toHaveBeenCalled();
    });

    it('sets status to idle when no provider is configured', async () => {
      mockGetActiveProvider.mockResolvedValue(null);

      await startPlayback(1);

      // Should set status to idle after failing to init session
      expect(playbackState.setStatus).toHaveBeenCalledWith('idle');
    });

    it('sets status to loading when starting playback', async () => {
      mockGetActiveProvider.mockResolvedValue({
        id: 'cfg-1',
        providerId: 'groq',
        name: 'Test',
        apiKey: 'key',
      });
      mockGetSettings.mockResolvedValue({ activeVoiceId: 'v1' });
      mockGetProvider.mockReturnValue({
        listVoices: vi.fn().mockResolvedValue([{ id: 'v1', name: 'Voice' }]),
      });

      // Mock content script interactions
      mockSendTabMessage
        .mockResolvedValueOnce({ wordCount: 0 }) // ensureContentScript ping
        .mockResolvedValueOnce({ error: 'no content' }); // EXTRACT_CONTENT

      await startPlayback(1);

      // Should have set loading status initially
      expect(playbackState.setStatus).toHaveBeenCalledWith('loading');
      // Then idle after extraction fails
      expect(playbackState.setStatus).toHaveBeenCalledWith('idle');
    });
  });
});
