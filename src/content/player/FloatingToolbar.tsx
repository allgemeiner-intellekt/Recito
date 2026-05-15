import React, { useRef, useEffect, useState } from 'react';
import { useToolbarStore } from '../state/store';
import { useShallow } from 'zustand/shallow';
import {
  PlayPauseWithProgress,
  SkipButton,
  SpeedPopup,
  VolumeSlider,
  CloseButton,
  ExpandButton,
} from './ToolbarControls';
import { ExpandedPanel } from './ExpandedPanel';
import { useDrag } from './useDrag';

export function FloatingToolbar() {
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Split selectors by change frequency to avoid unnecessary re-renders
  const { playbackStatus, currentChunkIndex, totalChunks, chunkProgress } =
    useToolbarStore(useShallow((s) => ({
      playbackStatus: s.playbackStatus,
      currentChunkIndex: s.currentChunkIndex,
      totalChunks: s.totalChunks,
      chunkProgress: s.chunkProgress,
    })));

  const { speed, volume, activeProviderId } =
    useToolbarStore(useShallow((s) => ({
      speed: s.speed,
      volume: s.volume,
      activeProviderId: s.activeProviderId,
    })));

  const { toolbarVisible, expanded, toastMessage } =
    useToolbarStore(useShallow((s) => ({
      toolbarVisible: s.toolbarVisible,
      expanded: s.expanded,
      toastMessage: s.toastMessage,
    })));

  const {
    play,
    pause,
    resume,
    stop,
    skipForward,
    skipBackward,
    setSpeed,
    setVolume,
    hideToolbar,
    toggleExpanded,
  } = useToolbarStore(useShallow((s) => ({
    play: s.play,
    pause: s.pause,
    resume: s.resume,
    stop: s.stop,
    skipForward: s.skipForward,
    skipBackward: s.skipBackward,
    setSpeed: s.setSpeed,
    setVolume: s.setVolume,
    hideToolbar: s.hideToolbar,
    toggleExpanded: s.toggleExpanded,
  })));

  const { getStyle, onMouseDown } = useDrag(toolbarRef);

  // Entrance animation: track when toolbar becomes visible
  const [animClass, setAnimClass] = useState('');
  const prevVisible = useRef(false);

  useEffect(() => {
    if (toolbarVisible && !prevVisible.current) {
      setAnimClass('ir-toolbar-enter');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimClass('ir-toolbar-enter ir-toolbar-enter-active');
        });
      });
    } else if (!toolbarVisible) {
      setAnimClass('');
    }
    prevVisible.current = toolbarVisible;
  }, [toolbarVisible]);

  // Escape key to dismiss toolbar
  useEffect(() => {
    if (!toolbarVisible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideToolbar();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [toolbarVisible, hideToolbar]);

  if (!toolbarVisible) return null;

  const isPlaying = playbackStatus === 'playing';
  const isLoading = playbackStatus === 'loading';

  const toast = toastMessage ? (
    <div className="ir-toast">{toastMessage}</div>
  ) : null;

  const handlePlayPause = () => {
    if (isPlaying) {
      pause();
    } else if (playbackStatus === 'paused') {
      resume();
    } else {
      play();
    }
  };

  const handleClose = () => {
    stop();
    hideToolbar();
  };

  return (
    <>
    {toast}
    <div
      ref={toolbarRef}
      className={`ir-toolbar ${expanded ? 'ir-toolbar--expanded' : 'ir-toolbar--collapsed'} ${animClass}`}
      style={getStyle()}
      onMouseDown={onMouseDown}
      role="toolbar"
      aria-label="Text-to-speech controls"
    >
      <div className="ir-toolbar-controls">
        <SkipButton direction="backward" onClick={skipBackward} />
        <PlayPauseWithProgress
          isPlaying={isPlaying}
          isLoading={isLoading}
          onClick={handlePlayPause}
          progress={chunkProgress}
          chunkIndex={currentChunkIndex}
          totalChunks={totalChunks}
        />
        <SkipButton direction="forward" onClick={skipForward} />
        <VolumeSlider volume={volume} onChange={setVolume} />
        <SpeedPopup speed={speed} onChangeSpeed={setSpeed} activeProviderId={activeProviderId} />
        <ExpandButton expanded={expanded} onClick={toggleExpanded} />
        <CloseButton onClick={handleClose} />
      </div>
      {expanded && <ExpandedPanel />}
    </div>
    </>
  );
}
