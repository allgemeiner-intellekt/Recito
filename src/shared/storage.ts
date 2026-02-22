import type { TTSSettings, ReadingProgress } from './types';
import { DEFAULT_SETTINGS, PROGRESS_MAX_ENTRIES } from './constants';

const SETTINGS_KEY = 'ir-settings';
const PROGRESS_KEY = 'ir-reading-progress';

export async function loadSettings(): Promise<TTSSettings> {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...result[SETTINGS_KEY] };
}

export async function saveSettings(settings: TTSSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function loadReadingProgress(): Promise<ReadingProgress[]> {
  const result = await chrome.storage.local.get(PROGRESS_KEY);
  return result[PROGRESS_KEY] || [];
}

export async function saveReadingProgress(
  entry: ReadingProgress
): Promise<void> {
  const entries = await loadReadingProgress();
  const existingIndex = entries.findIndex((e) => e.url === entry.url);
  if (existingIndex >= 0) {
    entries[existingIndex] = entry;
  } else {
    entries.unshift(entry);
  }
  const capped = entries.slice(0, PROGRESS_MAX_ENTRIES);
  await chrome.storage.local.set({ [PROGRESS_KEY]: capped });
}
