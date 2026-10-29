import { browser } from 'wxt/browser';
import type { Area } from '@/platform/capture-tool';

/** Base64 PNG of an area of the visible tab; Chrome can only capture the whole view. */
export async function cropVisibleTab(
  windowId: number,
  area: Area,
  viewportWidth: number,
): Promise<string> {
  const shot = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
  const bitmap = await createImageBitmap(await (await fetch(shot)).blob());
  // The picture is in device pixels (page zoom included); the area in CSS pixels.
  const scale = bitmap.width / viewportWidth;
  const x = Math.min(bitmap.width - 1, Math.max(0, Math.round(area.x * scale)));
  const y = Math.min(bitmap.height - 1, Math.max(0, Math.round(area.y * scale)));
  const width = Math.max(1, Math.min(bitmap.width - x, Math.round(area.width * scale)));
  const height = Math.max(1, Math.min(bitmap.height - y, Math.round(area.height * scale)));
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext('2d')!.drawImage(bitmap, x, y, width, height, 0, 0, width, height);
  const bytes = new Uint8Array(
    await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer(),
  );
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  }
  return btoa(binary);
}
