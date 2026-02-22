import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

export function mountApp(): void {
  const host = document.createElement('div');
  host.id = 'immersive-reader-root';
  host.style.all = 'initial';
  host.style.position = 'fixed';
  host.style.zIndex = '2147483647';
  host.style.top = '0';
  host.style.left = '0';
  host.style.width = '0';
  host.style.height = '0';

  const shadow = host.attachShadow({ mode: 'open' });

  const container = document.createElement('div');
  container.id = 'ir-app';
  shadow.appendChild(container);

  document.body.appendChild(host);
  createRoot(container).render(<App shadowRoot={shadow} />);
}
