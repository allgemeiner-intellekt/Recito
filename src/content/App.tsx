import React, { useEffect, useRef, useCallback } from 'react';
import { FloatingPlayer } from './player/FloatingPlayer';
import { useStore } from './state/store';
import { MSG, type ExtensionMessage } from '@shared/messages';
import type { PageInfo, TextMapResult } from '@shared/types';
import { extractContent } from './extraction/extractor';
import { segmentText } from './extraction/segmenter';
import { buildTextNodeMap } from './highlighting/dom-mapper';
import { Highlighter } from './highlighting/highlighter';
import { findArticleRoot } from './extraction/generic';
import { injectPlayButtons, cleanupPlayButtons } from './injection/injector';
import { saveReadingProgress } from '@shared/storage';

interface AppProps {
  shadowRoot: ShadowRoot;
}

export function App({ shadowRoot }: AppProps) {
  const playback = useStore((s) => s.playback);
  const error = useStore((s) => s.error);
  const setPlayback = useStore((s) => s.setPlayback);
  const setSegments = useStore((s) => s.setSegments);
  const setTextNodeMap = useStore((s) => s.setTextNodeMap);
  const highlighterRef = useRef<Highlighter | null>(null);

  // Initialize: inject play buttons
  useEffect(() => {
    try {
      injectPlayButtons();
    } catch (err) {
      console.error('Immersive Reader: injection error', err);
    }
    return () => cleanupPlayButtons();
  }, []);

  const getSettings = useCallback(() => useStore.getState().settings, []);

  const sendPlaySegment = useCallback((segment: { text: string; id: number }, segmentIndex: number) => {
    highlighterRef.current?.activateSegment(segmentIndex);
    const settings = getSettings();
    chrome.runtime.sendMessage({
      type: MSG.PLAY_SEGMENT,
      text: segment.text,
      segmentId: segment.id,
      settings: {
        apiUrl: settings.apiUrl,
        apiKey: settings.apiKey,
        voice: settings.voice,
        speed: settings.speed,
        model: settings.model,
      },
    }).catch(console.error);
  }, [getSettings]);

  const sendPrefetch = useCallback((segment: { text: string; id: number }) => {
    const settings = getSettings();
    chrome.runtime.sendMessage({
      type: MSG.PREFETCH_SEGMENT,
      text: segment.text,
      segmentId: segment.id,
      settings: {
        apiUrl: settings.apiUrl,
        apiKey: settings.apiKey,
        voice: settings.voice,
        speed: settings.speed,
        model: settings.model,
      },
    }).catch(console.error);
  }, [getSettings]);

  const stopPlayback = useCallback(() => {
    chrome.runtime.sendMessage({ type: MSG.STOP }).catch(console.error);
    highlighterRef.current?.deactivateAll();
    highlighterRef.current = null;
    useStore.getState().setError(null);
    setPlayback({
      isPlaying: false,
      isPaused: false,
      currentSegmentIndex: 0,
      totalSegments: 0,
      segmentProgress: 0,
      currentTime: 0,
      duration: 0,
    });
  }, [setPlayback]);

  const advanceToNextSegment = useCallback(() => {
    const store = useStore.getState();
    const { currentSegmentIndex, totalSegments } = store.playback;
    const segs = store.segments;
    const nextIndex = currentSegmentIndex + 1;

    highlighterRef.current?.deactivateSegment();

    if (nextIndex >= totalSegments) {
      stopPlayback();
      return;
    }

    setPlayback({
      currentSegmentIndex: nextIndex,
      segmentProgress: 0,
      currentTime: 0,
      duration: 0,
    });

    sendPlaySegment(segs[nextIndex], nextIndex);

    // Save reading progress
    saveReadingProgress({
      url: window.location.href,
      title: document.title,
      segmentIndex: nextIndex,
      totalSegments,
      timestamp: Date.now(),
    }).catch(console.error);

    // Prefetch next+1 segment
    if (nextIndex + 1 < segs.length) {
      sendPrefetch(segs[nextIndex + 1]);
    }
  }, [sendPlaySegment, sendPrefetch, setPlayback, stopPlayback]);

  const startReading = useCallback((fromSegmentIndex = 0, sourceElement?: Element) => {
    const store = useStore.getState();

    // Clean up local UI — don't send STOP to offscreen because it races
    // with the PLAY_SEGMENT we're about to send. The offscreen's
    // playSegment() already calls cleanup() at the start.
    if (store.playback.isPlaying) {
      highlighterRef.current?.deactivateAll();
    }

    // Clear any previous error
    store.setError(null);

    let rootElement: Element;

    if (sourceElement) {
      // Direct element playback (from injected button)
      rootElement = sourceElement;
    } else {
      // Full page extraction — use extractContent for Readability title/wordCount,
      // but get text from buildTextNodeMap for offset alignment
      const result = extractContent();
      if (!result) return;
      rootElement = result.sourceElement ?? findArticleRoot() ?? document.body;
    }

    // buildTextNodeMap is the single source of truth for text + offsets
    const mapResult: TextMapResult = buildTextNodeMap(rootElement);
    if (mapResult.text.trim().length === 0) return;

    const segs = segmentText(mapResult.text);
    if (segs.length === 0) return;

    setSegments(segs);
    setTextNodeMap(mapResult.entries);

    highlighterRef.current = new Highlighter(mapResult.entries, segs);

    setPlayback({
      isPlaying: true,
      isPaused: false,
      currentSegmentIndex: fromSegmentIndex,
      totalSegments: segs.length,
      segmentProgress: 0,
      currentTime: 0,
      duration: 0,
    });

    sendPlaySegment(segs[fromSegmentIndex], fromSegmentIndex);

    if (fromSegmentIndex + 1 < segs.length) {
      sendPrefetch(segs[fromSegmentIndex + 1]);
    }
  }, [setSegments, setTextNodeMap, setPlayback, sendPlaySegment, sendPrefetch]);

  // Listen for messages from background - single stable listener
  useEffect(() => {
    const handler = (
      message: ExtensionMessage,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ): boolean => {
      switch (message.type) {
        case MSG.PLAYBACK_PROGRESS: {
          const store = useStore.getState();
          store.setPlayback({
            currentTime: message.currentTime,
            duration: message.duration,
            segmentProgress: message.duration > 0 ? message.currentTime / message.duration : 0,
          });
          highlighterRef.current?.updateProgress(
            message.currentTime,
            message.duration,
            message.durationFinal
          );
          return false;
        }

        case MSG.SEGMENT_COMPLETE: {
          const store = useStore.getState();
          const currentSeg = store.segments[store.playback.currentSegmentIndex];
          if (currentSeg && message.segmentId !== currentSeg.id) {
            console.warn('Ignoring stale SEGMENT_COMPLETE for segment', message.segmentId);
            return false;
          }
          advanceToNextSegment();
          return false;
        }

        case MSG.PLAYBACK_ERROR: {
          const store = useStore.getState();
          const currentSeg = store.segments[store.playback.currentSegmentIndex];
          if (currentSeg && message.segmentId !== currentSeg.id) {
            console.warn('Ignoring stale PLAYBACK_ERROR for segment', message.segmentId);
            return false;
          }
          console.error('Playback error:', message.error);
          highlighterRef.current?.deactivateAll();
          store.setPlayback({ isPaused: true });
          store.setError(message.error);
          return false;
        }

        case MSG.GET_PAGE_INFO: {
          const result = extractContent();
          const store = useStore.getState();
          const info: PageInfo = {
            wordCount: result?.wordCount ?? 0,
            isPlaying: store.playback.isPlaying,
            title: result?.title ?? document.title,
          };
          sendResponse(info);
          return true;
        }

        case MSG.START_READING:
          startReading();
          return false;

        default:
          return false;
      }
    };

    chrome.runtime.onMessage.addListener(handler);
    return () => {
      chrome.runtime.onMessage.removeListener(handler);
    };
  }, [advanceToNextSegment, startReading]);

  // Tab visibility: re-sync on return
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible' && highlighterRef.current) {
        const store = useStore.getState();
        if (store.playback.isPlaying && !store.playback.isPaused) {
          highlighterRef.current.updateProgress(
            store.playback.currentTime,
            store.playback.duration,
            true
          );
        }
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  const retryCurrentSegment = useCallback(() => {
    const store = useStore.getState();
    store.setError(null);
    const { currentSegmentIndex } = store.playback;
    const segs = store.segments;
    if (segs[currentSegmentIndex]) {
      store.setPlayback({ isPaused: false });
      highlighterRef.current?.activateSegment(currentSegmentIndex);
      sendPlaySegment(segs[currentSegmentIndex], currentSegmentIndex);
    }
  }, [sendPlaySegment]);

  const dismissError = useCallback(() => {
    useStore.getState().setError(null);
  }, []);

  // Listen for injected play button events
  useEffect(() => {
    const handler = () => {
      const el = useStore.getState().pendingPlaybackElement;
      if (el) {
        useStore.getState().setPendingPlaybackElement(null);
        startReading(0, el);
      }
    };
    document.addEventListener('ir-start-playback', handler);
    return () => document.removeEventListener('ir-start-playback', handler);
  }, [startReading]);

  const togglePause = useCallback(() => {
    const store = useStore.getState();
    if (store.playback.isPaused) {
      chrome.runtime.sendMessage({ type: MSG.RESUME }).catch(console.error);
      setPlayback({ isPaused: false });
    } else {
      chrome.runtime.sendMessage({ type: MSG.PAUSE }).catch(console.error);
      setPlayback({ isPaused: true });
    }
  }, [setPlayback]);

  const skipForward = useCallback(() => {
    advanceToNextSegment();
  }, [advanceToNextSegment]);

  const skipBack = useCallback(() => {
    const store = useStore.getState();
    const { currentSegmentIndex } = store.playback;
    const segs = store.segments;
    const prevIndex = Math.max(0, currentSegmentIndex - 1);

    highlighterRef.current?.deactivateSegment();

    setPlayback({
      currentSegmentIndex: prevIndex,
      segmentProgress: 0,
      currentTime: 0,
      duration: 0,
    });

    sendPlaySegment(segs[prevIndex], prevIndex);
  }, [setPlayback, sendPlaySegment]);

  if (!playback.isPlaying) return null;

  return (
    <FloatingPlayer
      shadowRoot={shadowRoot}
      playback={playback}
      error={error}
      onTogglePause={togglePause}
      onSkipForward={skipForward}
      onSkipBack={skipBack}
      onStop={stopPlayback}
      onStartReading={startReading}
      onRetry={retryCurrentSegment}
      onDismissError={dismissError}
    />
  );
}
