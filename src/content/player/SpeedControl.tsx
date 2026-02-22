import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SPEED_MIN, SPEED_MAX, SPEED_STEP } from '@shared/constants';
import { MSG } from '@shared/messages';
import { useStore } from '../state/store';

export function SpeedControl() {
  const [isOpen, setIsOpen] = useState(false);
  const speed = useStore((s) => s.settings.speed);
  const setSettings = useStore((s) => s.setSettings);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on clicks outside the wrapper
  useEffect(() => {
    if (!isOpen) return;

    const handleClick = (e: Event) => {
      const path = e.composedPath();
      if (wrapperRef.current && !path.includes(wrapperRef.current)) {
        setIsOpen(false);
      }
    };

    // Listen on both the shadow root's host document and within
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClick, true);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClick, true);
    };
  }, [isOpen]);

  const handleSpeedChange = useCallback(
    (newSpeed: number) => {
      setSettings({ speed: newSpeed });
      chrome.runtime.sendMessage({
        type: MSG.SET_SPEED,
        speed: newSpeed,
      }).catch(console.error);
    },
    [setSettings]
  );

  return (
    <div className="ir-speed-wrapper" ref={wrapperRef}>
      <button className="ir-speed-btn" onClick={() => setIsOpen(!isOpen)}>
        {speed.toFixed(1)}x
      </button>
      {isOpen && (
        <div className="ir-speed-popup">
          <span className="ir-speed-label">{SPEED_MAX}x</span>
          <input
            type="range"
            className="ir-speed-slider"
            min={SPEED_MIN}
            max={SPEED_MAX}
            step={SPEED_STEP}
            value={speed}
            onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
          />
          <span className="ir-speed-label">{SPEED_MIN}x</span>
        </div>
      )}
    </div>
  );
}
