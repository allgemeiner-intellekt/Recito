const PLAY_SVG = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M2.5 1.5L10 6L2.5 10.5V1.5Z" fill="#666666"/>
</svg>`;

export function createPlayButton(onClick: () => void): HTMLElement {
  const btn = document.createElement('button');
  btn.className = 'ir-play-btn';
  btn.setAttribute('aria-label', 'Read aloud');
  btn.setAttribute('title', 'Read aloud');
  btn.innerHTML = PLAY_SVG;

  // Inline styles to avoid needing a stylesheet in the host page
  Object.assign(btn.style, {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    border: '1px solid #E5E5E5',
    background: '#FFFFFF',
    cursor: 'pointer',
    padding: '0',
    marginRight: '8px',
    verticalAlign: 'middle',
    flexShrink: '0',
    transition: 'background 0.15s ease, border-color 0.15s ease',
    position: 'relative' as const,
    zIndex: '1',
  });

  btn.addEventListener('mouseenter', () => {
    btn.style.background = '#F5F5F5';
    btn.style.borderColor = '#CCCCCC';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = '#FFFFFF';
    btn.style.borderColor = '#E5E5E5';
  });

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });

  return btn;
}

export function removeAllPlayButtons(): void {
  document.querySelectorAll('.ir-play-btn').forEach((btn) => btn.remove());
}
