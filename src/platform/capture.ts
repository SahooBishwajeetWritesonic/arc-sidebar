import { browser } from 'wxt/browser';
import type { SitePermissionKind, SitePermissionSetting } from './types';

/** Chrome's own defaults: the site menu lists only the permissions a site has changed. */
export const SITE_PERMISSION_DEFAULTS: Record<SitePermissionKind, SitePermissionSetting> = {
  javascript: 'allow',
  images: 'allow',
  popups: 'block',
  notifications: 'ask',
  location: 'ask',
  camera: 'ask',
  microphone: 'ask',
  automaticDownloads: 'ask',
  cookies: 'allow',
};

/** Chrome draws at most this many pixels down; taller pages are scaled to fit. */
const MAX_PIXELS = 16_384;

/**
 * The whole page in one capture, through Chrome's debugger (Chrome shows its
 * "started debugging" banner until it detaches, under a second later).
 */
export async function fullPage(tabId: number): Promise<Blob> {
  const target = { tabId };
  await browser.debugger.attach(target, '1.3');
  try {
    const send = <T>(method: string, params?: object) =>
      browser.debugger.sendCommand(target, method, params) as Promise<T>;
    const { cssContentSize: size } = await send<{
      cssContentSize: { width: number; height: number };
    }>('Page.getLayoutMetrics');
    const { result } = await send<{ result: { value: number } }>('Runtime.evaluate', {
      expression: 'devicePixelRatio',
      returnByValue: true,
    });
    const ratio = result.value || 1;
    const scale = Math.min(1, MAX_PIXELS / (size.height * ratio));
    const { data } = await send<{ data: string }>('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: size.width, height: size.height, scale },
    });
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    return new Blob([bytes], { type: 'image/png' });
  } finally {
    await browser.debugger.detach(target).catch(() => {});
  }
}
