import type { TextChunk } from '@shared/types';
import type { PositionedRun } from './model';
import type { WereadChapter } from './reader';

const INTERACTIVE = 'a, button, input, select, textarea, summary, [role="button"], [role="link"], [contenteditable], [data-wr-role="note"]';
const CLICK_DELAY_MS = 300;
const DRAG_DISTANCE = 5;

interface Line {
  baseline: number;
  runs: PositionedRun[];
}

/** Hit-test the captured geometry, so Canvas and virtualized DOM use the same seek path. */
export class WereadScrubber {
  private lines: Line[] = [];
  private gesture: { x: number; y: number; pointerId: number; moved: boolean; ended: boolean } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private chapter: WereadChapter, private chunks: TextChunk[],
    private isActive: () => boolean, private onSeek: (index: number) => void) {
    for (const run of chapter.runs) {
      const line = this.lines.at(-1);
      if (line && Math.abs(line.baseline - run.baseline) < 3) line.runs.push(run);
      else this.lines.push({ baseline: run.baseline, runs: [run] });
    }
    document.addEventListener('pointerdown', this.onPointerDown, true);
    document.addEventListener('pointermove', this.onPointerMove, { capture: true, passive: true });
    document.addEventListener('pointerup', this.onPointerUp, true);
    document.addEventListener('pointercancel', this.cancelGesture, true);
    document.addEventListener('dblclick', this.cancelGesture, true);
    document.addEventListener('click', this.onClick, true);
  }

  destroy(): void {
    this.cancelGesture();
    document.removeEventListener('pointerdown', this.onPointerDown, true);
    document.removeEventListener('pointermove', this.onPointerMove, true);
    document.removeEventListener('pointerup', this.onPointerUp, true);
    document.removeEventListener('pointercancel', this.cancelGesture, true);
    document.removeEventListener('dblclick', this.cancelGesture, true);
    document.removeEventListener('click', this.onClick, true);
  }

  private cancelGesture = (): void => {
    this.gesture = null;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  };

  private eligible(event: MouseEvent): boolean {
    const target = event.target;
    return this.isActive() && this.chapter.root.isConnected && event.button === 0
      && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
      && target instanceof Element && this.chapter.root.contains(target) && !target.closest(INTERACTIVE);
  }

  private onPointerDown = (event: PointerEvent): void => {
    // A second press cancels the first pending seek, leaving double-click selection intact.
    this.cancelGesture();
    if (!this.eligible(event)) return;
    this.gesture = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, moved: false, ended: false };
  };

  private onPointerMove = (event: PointerEvent): void => {
    const gesture = this.gesture;
    if (!gesture || gesture.ended || event.pointerId !== gesture.pointerId) return;
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > DRAG_DISTANCE) gesture.moved = true;
  };

  private onPointerUp = (event: PointerEvent): void => {
    this.onPointerMove(event);
    if (this.gesture && event.pointerId === this.gesture.pointerId) this.gesture.ended = true;
  };

  private onClick = (event: MouseEvent): void => {
    const gesture = this.gesture;
    this.gesture = null;
    if (!gesture || !gesture.ended || gesture.moved || event.detail !== 1 || event.defaultPrevented || !this.eligible(event)) return;
    const index = this.resolveChunk(event.clientX, event.clientY);
    if (index < 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.isActive() && this.chapter.root.isConnected && window.getSelection()?.isCollapsed !== false) this.onSeek(index);
    }, CLICK_DELAY_MS);
  };

  private resolveChunk(clientX: number, clientY: number): number {
    const rect = this.chapter.root.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    // Find the two neighboring lines, then inspect only their glyph boxes. No
    // per-frame DOM measurements or chapter-wide scans during pointer movement.
    let low = 0;
    let high = this.lines.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.lines[mid].baseline < y) low = mid + 1;
      else high = mid;
    }
    for (const line of [this.lines[low], this.lines[low - 1]]) {
      const run = line?.runs.find(item => item.text.trim() && x >= item.x && x < item.x + item.width
        && y >= item.y && y <= item.y + item.height);
      if (!run) continue;
      let start = 0;
      let end = this.chunks.length;
      while (start < end) {
        const mid = (start + end) >>> 1;
        if (this.chunks[mid].endOffset <= run.startOffset) start = mid + 1;
        else end = mid;
      }
      const chunk = this.chunks[start];
      if (chunk && run.startOffset >= chunk.startOffset) return chunk.index;
    }
    return -1;
  }
}
