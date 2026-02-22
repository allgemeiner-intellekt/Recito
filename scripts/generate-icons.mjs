import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';

function createPNG(size) {
  const pixels = new Uint8Array(size * size * 4);
  const bg = [26, 26, 26];
  const fg = [255, 255, 255];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const radius = size * 0.2;

      if (isInsideRoundedRect(x, y, 0, 0, size, size, radius)) {
        pixels[idx] = bg[0];
        pixels[idx + 1] = bg[1];
        pixels[idx + 2] = bg[2];
        pixels[idx + 3] = 255;

        const barCount = 5;
        const barWidth = Math.max(1, Math.round(size * 0.08));
        const gap = (size * 0.6) / (barCount - 1);
        const startX = size * 0.2;
        const centerY = size / 2;
        const heights = [0.25, 0.5, 0.7, 0.45, 0.3];

        for (let i = 0; i < barCount; i++) {
          const bx = Math.round(startX + i * gap);
          const bh = Math.round(size * heights[i]);
          const by = Math.round(centerY - bh / 2);

          if (x >= bx - Math.floor(barWidth / 2) && x < bx + Math.ceil(barWidth / 2) &&
              y >= by && y < by + bh) {
            pixels[idx] = fg[0];
            pixels[idx + 1] = fg[1];
            pixels[idx + 2] = fg[2];
          }
        }
      } else {
        pixels[idx + 3] = 0;
      }
    }
  }

  return encodePNG(pixels, size, size);
}

function isInsideRoundedRect(x, y, rx, ry, rw, rh, radius) {
  if (x < rx + radius && y < ry + radius) return dist(x, y, rx + radius, ry + radius) <= radius;
  if (x >= rx + rw - radius && y < ry + radius) return dist(x, y, rx + rw - radius, ry + radius) <= radius;
  if (x < rx + radius && y >= ry + rh - radius) return dist(x, y, rx + radius, ry + rh - radius) <= radius;
  if (x >= rx + rw - radius && y >= ry + rh - radius) return dist(x, y, rx + rw - radius, ry + rh - radius) <= radius;
  return x >= rx && x < rx + rw && y >= ry && y < ry + rh;
}

function dist(x1, y1, x2, y2) { return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2); }

function encodePNG(pixels, width, height) {
  const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0;
    for (let x = 0; x < width * 4; x++) {
      rawData[y * (1 + width * 4) + 1 + x] = pixels[y * width * 4 + x];
    }
  }

  const compressed = deflateSync(rawData);

  return Buffer.concat([
    SIGNATURE,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])) >>> 0, 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
  }
  return crc ^ 0xFFFFFFFF;
}

for (const size of [16, 48, 128]) {
  writeFileSync(`src/assets/icons/icon-${size}.png`, createPNG(size));
  console.log(`Generated icon-${size}.png`);
}
