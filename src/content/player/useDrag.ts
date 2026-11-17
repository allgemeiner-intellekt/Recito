import { useEffect, useState } from 'react';
import type { AppSettings } from '@shared/types';
import type React from 'react';

export function useDrag(
  settings: AppSettings,
  update: (partial: Partial<AppSettings>) => Promise<void>,
) {
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [height, setHeight] = useState(window.innerHeight);
  useEffect(() => {
    const resize = () => setHeight(window.innerHeight);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.max(8, Math.min(drag?.y ?? settings.playerOffset, height - 280)),
    ...(drag
      ? { left: drag.x, right: 'auto' }
      : settings.playerPosition === 'rail-left'
        ? { left: 14, right: 'auto' }
        : { right: 14, left: 'auto' }),
    zIndex: 2147483647,
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button,input,select')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const initial = { x: e.clientX, y: e.clientY };
    let last: { x: number; y: number } | null = null;
    const move = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - initial.x, event.clientY - initial.y) < 5 && !last) return;
      last = { x: rect.left + event.clientX - initial.x, y: rect.top + event.clientY - initial.y };
      setDrag(last);
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      if (last)
        void update({
          playerPosition: last.x < window.innerWidth / 2 ? 'rail-left' : 'rail-right',
          playerOffset: Math.max(8, Math.min(last.y, window.innerHeight - 280)),
        });
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end, { once: true });
    e.preventDefault();
  };
  return { style, onPointerDown };
}
