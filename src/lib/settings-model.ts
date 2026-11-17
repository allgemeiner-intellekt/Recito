import { DEFAULT_SETTINGS } from './constants';
import type { AppSettings, InkColor } from './types';

export const INKS: Record<InkColor, string> = {
  blue: '#93c8f4', amber: '#f4b740', rose: '#f3a0a6', mint: '#8ed6b1',
};

/** Normalize stored settings and previous-version exports at the same boundary. */
export function normalizeSettings(value: Partial<AppSettings>, legacyPosition?: unknown): AppSettings {
  const highlight = { ...DEFAULT_SETTINGS.highlight, ...value.highlight };
  const playback = { ...DEFAULT_SETTINGS.playback, ...value.playback };
  const ink = Object.prototype.hasOwnProperty.call(INKS, value.ink ?? '') ? value.ink! : 'blue';
  const highlightStyle = ['marker', 'underline', 'sentence'].includes(value.highlightStyle ?? '')
    ? value.highlightStyle! : highlight.wordEnabled ? 'marker' : 'sentence';
  const followAlong = typeof value.followAlong === 'boolean'
    ? value.followAlong : highlight.autoScroll && playback.autoScrollEnabled;
  return {
    ...DEFAULT_SETTINGS, ...value, ink, highlightStyle, followAlong,
    themeColor: INKS[ink],
    theme: ['system', 'light', 'dark'].includes(value.theme ?? '') ? value.theme! : 'system',
    playerPosition: value.playerPosition === 'rail-left' || (!value.playerPosition && legacyPosition === 'bottom-left')
      ? 'rail-left' : 'rail-right',
    playerOffset: Number.isFinite(value.playerOffset) ? Math.max(0, value.playerOffset!) : 160,
    tuckWhilePlaying: typeof value.tuckWhilePlaying === 'boolean' ? value.tuckWhilePlaying : true,
    iconClick: value.iconClick === 'read' ? 'read' : 'popup',
    // Compatibility projections keep existing readers working during the staged redesign.
    playback: { ...playback, autoScrollEnabled: followAlong },
    highlight: {
      ...highlight, wordColor: null, sentenceColor: null,
      wordEnabled: highlightStyle !== 'sentence', sentenceEnabled: true, autoScroll: followAlong,
    },
  };
}
