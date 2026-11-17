// Regenerate the PNGs from the canonical SVG with an installed SVG renderer.
// Usage: node scripts/generate-icons.mjs /path/to/rsvg-convert
import { spawnSync } from 'node:child_process';
const renderer = process.argv[2] ?? 'rsvg-convert';
for (const size of [16, 48, 128]) {
  const result = spawnSync(
    renderer,
    [
      '-w',
      String(size),
      '-h',
      String(size),
      '-o',
      `public/icons/icon-${size}.png`,
      'public/icons/icon.svg',
    ],
    { stdio: 'inherit' },
  );
  if (result.error)
    throw new Error('Install librsvg (rsvg-convert), or pass its path as the first argument.', {
      cause: result.error,
    });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
