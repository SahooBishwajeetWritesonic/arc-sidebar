/**
 * Grey noise for the grain layer, made once (Arc ships a texture image; we generate ours).
 * Blended with `overlay`, it nudges each pixel a few levels lighter or darker.
 */
let tile: string | undefined;

export function grainTile(): string {
  if (tile) return tile;
  const size = 160;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return '';
  const image = context.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const value = Math.floor(Math.random() * 256);
    image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  tile = `url(${canvas.toDataURL('image/png')})`;
  return tile;
}
