import type { ThemeMode } from './types';
import { INKS } from './settings-model';

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    if (typeof window === 'undefined') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

export function applyAccentColor(
  hex: string | null,
  _resolvedTheme: 'light' | 'dark',
): void {
  const ink = Object.entries(INKS).find(([, color]) => color === hex)?.[0] ?? 'blue';
  document.documentElement.dataset.ink = ink;
}

export function applyTheme(
  mode: ThemeMode,
  themeColor?: string | null,
): void {
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;
  document.body.style.opacity = '1';
  applyAccentColor(themeColor ?? null, resolved);
}

export function watchTheme(
  mode: ThemeMode,
  callback: (resolved: 'light' | 'dark') => void,
): () => void {
  if (mode !== 'system' || typeof window === 'undefined') return () => {};
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = () => callback(mql.matches ? 'dark' : 'light');
  mql.addEventListener('change', handler);
  return () => mql.removeEventListener('change', handler);
}
