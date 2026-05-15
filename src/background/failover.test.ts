import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  markFailed,
  isHealthy,
  getHealth,
  getAllHealth,
  clearHealth,
  resetAllHealth,
  getCooldownDuration,
} from './failover';
import { ApiError } from '@shared/api-error';

// Cooldown durations must match the module constants
const COOLDOWN_429 = 60_000;
const COOLDOWN_403 = 5 * 60_000;
const COOLDOWN_5XX = 30_000;
const COOLDOWN_NETWORK = 30_000;

describe('failover', () => {
  beforeEach(() => {
    resetAllHealth();
    vi.useRealTimers();
  });

  describe('getCooldownDuration', () => {
    it('returns COOLDOWN_429 (60s) for 429 status', () => {
      const err = new ApiError('rate limited', 429, 'groq', true);
      expect(getCooldownDuration(err)).toBe(COOLDOWN_429);
    });

    it('returns COOLDOWN_403 (5min) for 403 status', () => {
      const err = new ApiError('forbidden', 403, 'groq', true);
      expect(getCooldownDuration(err)).toBe(COOLDOWN_403);
    });

    it('returns COOLDOWN_5XX (30s) for 5xx status', () => {
      const err = new ApiError('server error', 500, 'groq', true);
      expect(getCooldownDuration(err)).toBe(COOLDOWN_5XX);
    });

    it('returns COOLDOWN_NETWORK (30s) for network error (status 0)', () => {
      const err = new ApiError('network error', 0, 'groq', true);
      expect(getCooldownDuration(err)).toBe(COOLDOWN_NETWORK);
    });

    it('prefers retryAfterMs when present', () => {
      const err = new ApiError('rate limited', 429, 'groq', true, 120_000);
      expect(getCooldownDuration(err)).toBe(120_000);
    });
  });

  describe('markFailed', () => {
    it('sets status to cooldown with correct duration for 429', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      markFailed('config-1', new ApiError('rate limited', 429, 'groq', true));

      const health = getHealth('config-1');
      expect(health.status).toBe('cooldown');
      expect(health.cooldownUntil).toBe(now + COOLDOWN_429);
      expect(health.failCount).toBe(1);
    });

    it('sets status to cooldown with correct duration for 403', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      markFailed('config-1', new ApiError('forbidden', 403, 'groq', true));

      const health = getHealth('config-1');
      expect(health.status).toBe('cooldown');
      expect(health.cooldownUntil).toBe(now + COOLDOWN_403);
    });

    it('sets status to cooldown with correct duration for 5xx', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      markFailed('config-1', new ApiError('server error', 500, 'groq', true));

      const health = getHealth('config-1');
      expect(health.status).toBe('cooldown');
      expect(health.cooldownUntil).toBe(now + COOLDOWN_5XX);
    });

    it('sets status to cooldown with correct duration for network error', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      markFailed('config-1', new ApiError('network error', 0, 'groq', true));

      const health = getHealth('config-1');
      expect(health.status).toBe('cooldown');
      expect(health.cooldownUntil).toBe(now + COOLDOWN_NETWORK);
    });

    it('sets status to failed (permanent) for 401', () => {
      markFailed('config-1', new ApiError('unauthorized', 401, 'groq', false));

      const health = getHealth('config-1');
      expect(health.status).toBe('failed');
      expect(health.cooldownUntil).toBeUndefined();
    });

    it('increments failCount on each failure', () => {
      markFailed('config-1', new ApiError('err1', 500, 'groq', true));
      markFailed('config-1', new ApiError('err2', 500, 'groq', true));

      expect(getHealth('config-1').failCount).toBe(2);
    });

    it('records lastError with message, status, and timestamp', () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);

      markFailed('config-1', new ApiError('oops', 429, 'groq', true));

      const health = getHealth('config-1');
      expect(health.lastError).toEqual({
        message: 'oops',
        status: 429,
        timestamp: now,
      });
    });
  });

  describe('isHealthy', () => {
    it('returns true for a config with no recorded failures', () => {
      expect(isHealthy('unknown-config')).toBe(true);
    });

    it('returns false during cooldown', () => {
      vi.useFakeTimers();
      markFailed('config-1', new ApiError('rate limited', 429, 'groq', true));
      expect(isHealthy('config-1')).toBe(false);
    });

    it('returns true after cooldown expires', () => {
      vi.useFakeTimers();

      markFailed('config-1', new ApiError('rate limited', 429, 'groq', true));
      expect(isHealthy('config-1')).toBe(false);

      // Advance past the cooldown
      vi.advanceTimersByTime(COOLDOWN_429 + 1);
      expect(isHealthy('config-1')).toBe(true);
    });

    it('returns false after permanent failure (401)', () => {
      markFailed('config-1', new ApiError('unauthorized', 401, 'groq', false));
      expect(isHealthy('config-1')).toBe(false);
    });

    it('returns false after multiple consecutive failures', () => {
      // Multiple transient failures keep the config in cooldown
      markFailed('config-1', new ApiError('err1', 500, 'groq', true));
      markFailed('config-1', new ApiError('err2', 500, 'groq', true));
      markFailed('config-1', new ApiError('err3', 500, 'groq', true));

      expect(isHealthy('config-1')).toBe(false);
    });
  });

  describe('cooldown auto-expiry', () => {
    it('resets failCount when cooldown expires', () => {
      vi.useFakeTimers();

      markFailed('config-1', new ApiError('err', 500, 'groq', true));
      expect(getHealth('config-1').failCount).toBe(1);

      vi.advanceTimersByTime(COOLDOWN_5XX + 1);
      const health = getHealth('config-1');
      expect(health.status).toBe('healthy');
      expect(health.failCount).toBe(0);
    });

    it('clears cooldownUntil when cooldown expires', () => {
      vi.useFakeTimers();

      markFailed('config-1', new ApiError('err', 500, 'groq', true));
      expect(getHealth('config-1').cooldownUntil).toBeDefined();

      vi.advanceTimersByTime(COOLDOWN_5XX + 1);
      expect(getHealth('config-1').cooldownUntil).toBeUndefined();
    });
  });

  describe('getAllHealth', () => {
    it('returns health records for all tracked configs', () => {
      markFailed('config-a', new ApiError('err', 500, 'groq', true));
      markFailed('config-b', new ApiError('err', 429, 'groq', true));

      const all = getAllHealth();
      expect(Object.keys(all)).toEqual(expect.arrayContaining(['config-a', 'config-b']));
      expect(all['config-a'].status).toBe('cooldown');
      expect(all['config-b'].status).toBe('cooldown');
    });

    it('auto-expires cooldowns when called', () => {
      vi.useFakeTimers();

      markFailed('config-a', new ApiError('err', 500, 'groq', true));
      vi.advanceTimersByTime(COOLDOWN_5XX + 1);

      const all = getAllHealth();
      expect(all['config-a'].status).toBe('healthy');
    });
  });

  describe('clearHealth', () => {
    it('removes a specific config from health tracking', () => {
      markFailed('config-1', new ApiError('err', 500, 'groq', true));
      expect(isHealthy('config-1')).toBe(false);

      clearHealth('config-1');
      // After clearing, the config should start fresh (healthy)
      expect(isHealthy('config-1')).toBe(true);
    });
  });

  describe('resetAllHealth', () => {
    it('clears all health records', () => {
      markFailed('config-1', new ApiError('err', 500, 'groq', true));
      markFailed('config-2', new ApiError('err', 429, 'groq', true));

      resetAllHealth();

      expect(isHealthy('config-1')).toBe(true);
      expect(isHealthy('config-2')).toBe(true);
      // After resetAllHealth + isHealthy calls, entries are re-created as healthy
      const allHealth = getAllHealth();
      expect(Object.keys(allHealth).sort()).toEqual(['config-1', 'config-2']);
      expect(allHealth['config-1'].status).toBe('healthy');
      expect(allHealth['config-2'].status).toBe('healthy');
    });
  });
});
