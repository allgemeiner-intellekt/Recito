/** Draw the same R and marker as public/icons/icon.svg in worker-safe Canvas. */
export async function updateIcon(_color?: string | null): Promise<void> {
  try {
    const images: Record<number, ImageData> = {};
    for (const size of [16, 48, 128]) {
      const context = new OffscreenCanvas(size, size).getContext('2d')!;
      context.scale(size / 20, size / 20);
      context.fillStyle = '#1e1b17';
      context.beginPath();
      context.roundRect(0, 0, 20, 20, 5);
      context.fill();
      context.fillStyle = '#93c8f4';
      context.beginPath();
      context.roundRect(3.5, 11.2, 13, 4.6, 1);
      context.fill();
      context.strokeStyle = '#faf7f2';
      context.lineWidth = 1.9;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      context.moveTo(7, 14.5);
      context.lineTo(7, 5.5);
      context.lineTo(10.4, 5.5);
      context.bezierCurveTo(13.87, 5.5, 13.87, 10.7, 10.4, 10.7);
      context.lineTo(7, 10.7);
      context.moveTo(10.4, 10.7);
      context.lineTo(13.3, 14.5);
      context.stroke();
      images[size] = context.getImageData(0, 0, size, size);
    }
    await chrome.action.setIcon({ imageData: images });
  } catch (error) {
    console.error('Recito: failed to render icon', error);
  }
}
