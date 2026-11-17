import React from 'react';
const icons: Record<string, string> = {
  play: '<path class="f" d="M7 4.2v11.6a.6.6 0 0 0 .92.5l8.9-5.8a.6.6 0 0 0 0-1L7.92 3.7A.6.6 0 0 0 7 4.2z"/>',
  pause:
    '<rect class="f" x="5" y="4" width="3.6" height="12" rx="1"/><rect class="f" x="11.4" y="4" width="3.6" height="12" rx="1"/>',
  back: '<path class="f" d="M15.5 5.2v9.6a.5.5 0 0 1-.78.42L7.6 10.4a.5.5 0 0 1 0-.82l7.12-4.8a.5.5 0 0 1 .78.42z"/><path d="M5 5v10"/>',
  fwd: '<path class="f" d="M4.5 5.2v9.6a.5.5 0 0 0 .78.42l7.12-4.82a.5.5 0 0 0 0-.82L5.28 4.78a.5.5 0 0 0-.78.42z"/><path d="M15 5v10"/>',
  chev: '<path d="M12 5l-5 5 5 5"/>',
  close: '<path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/>',
  sliders:
    '<path d="M3.5 6.5h5M13.5 6.5h3M3.5 13.5h3M11.5 13.5h5"/><circle cx="11" cy="6.5" r="2.2"/><circle cx="9" cy="13.5" r="2.2"/>',
  check: '<path d="M4.5 10.5l3.5 3.5 7.5-8"/>',
  alert: '<path d="M10 3.5l7 12.5H3z"/><path d="M10 8.5v3.2M10 14v.1"/>',
  info: '<circle cx="10" cy="10" r="7"/><path d="M10 9.2v4.3M10 6.6v.1"/>',
  key: '<circle cx="7" cy="13" r="3.2"/><path d="M9.3 10.7L16 4M13.2 6.8l2.2 2.2"/>',
  wave: '<path d="M4 8v4M7 5.5v9M10 7.5v5M13 4.5v11M16 8v4"/>',
  lines: '<path d="M4 5.5h12M4 10h12M4 14.5h7"/>',
  circleplay: '<circle cx="10" cy="10" r="7"/><path class="f" d="M8.5 7.2v5.6l4.3-2.8z"/>',
  kbd: '<rect x="2.5" y="5" width="15" height="10" rx="2"/><path d="M6 8.7h.1M9 8.7h.1M12 8.7h.1M14.5 8.7h.1M7 11.8h6"/>',
  data: '<path d="M10 3.5v8.5M6.5 8.5L10 12l3.5-3.5M4 15.5h12"/>',
  ext: '<path d="M8.5 5H5v10h10v-3.5M11.5 4.5h4v4M15.5 4.5l-6.5 6.5"/>',
  vol: '<path d="M3.5 8v4h3l4 3.5v-11l-4 3.5z"/><path d="M13.5 7.5a3.6 3.6 0 0 1 0 5"/>',
  retry: '<path d="M15.5 10a5.5 5.5 0 1 1-1.7-4M15.5 3.8V7h-3.2"/>',
  eye: '<path d="M2.5 10s2.7-5 7.5-5 7.5 5 7.5 5-2.7 5-7.5 5-7.5-5-7.5-5z"/><circle cx="10" cy="10" r="2.2"/>',
  down: '<path d="M10 4v11M5.5 10.5L10 15l4.5-4.5"/>',
  logo: '<rect class="f" width="20" height="20" rx="5" style="fill:#1e1b17"/><rect x="3.5" y="11.2" width="13" height="4.6" rx="1" style="fill:#93c8f4;stroke:none"/><path d="M7 14.5v-9h3.4a2.6 2.6 0 0 1 0 5.2H7M10.4 10.7l2.9 3.8" style="stroke:#faf7f2;stroke-width:1.9"/>',
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="ic"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      dangerouslySetInnerHTML={{ __html: icons[name] ?? icons.info }}
    />
  );
}
