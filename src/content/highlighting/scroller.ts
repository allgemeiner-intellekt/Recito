import { AUTOSCROLL_TRIGGER_RATIO, AUTOSCROLL_TARGET_RATIO } from '@shared/constants';

export function autoScroll(element: HTMLElement): void {
  scrollToRect(element.getBoundingClientRect());
}

export function autoScrollRange(range: Range): void {
  scrollToRect(range.getBoundingClientRect());
}

function scrollToRect(rect: DOMRect): void {
  const viewportHeight = window.innerHeight;

  // Only scroll if element is near the bottom of the viewport
  if (rect.bottom > viewportHeight * AUTOSCROLL_TRIGGER_RATIO) {
    const targetY = window.scrollY + rect.top - viewportHeight * AUTOSCROLL_TARGET_RATIO;
    window.scrollTo({
      top: targetY,
      behavior: 'smooth',
    });
    return;
  }

  // Also scroll if element is above the viewport
  if (rect.top < 0) {
    const targetY = window.scrollY + rect.top - viewportHeight * AUTOSCROLL_TARGET_RATIO;
    window.scrollTo({
      top: targetY,
      behavior: 'smooth',
    });
  }
}
