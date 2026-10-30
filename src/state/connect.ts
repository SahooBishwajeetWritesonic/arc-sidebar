import type { Platform } from '@/platform/types';
import { connectCalendar } from './calendar';
import { connectMedia } from './media';
import { connectRecording } from './recording';
import { connectSidebar } from './sidebar';
import { connectTabs } from './tabs';

/**
 * Connects the panel's stores to the browser (or the harness's fake). Only the sidebar
 * follows media players; the command bar doesn't need them.
 */
export async function connect(
  platform: Platform,
  { media = false }: { media?: boolean } = {},
): Promise<() => void> {
  const windowId = await platform.currentWindowId();
  const [offTabs, offSidebar] = await Promise.all([
    connectTabs(platform, windowId),
    connectSidebar(platform, windowId),
  ]);
  const offMedia = media ? connectMedia(platform) : () => {};
  const offRecording = connectRecording(platform);
  const offCalendar = connectCalendar(platform);
  return () => {
    offTabs();
    offSidebar();
    offMedia();
    offRecording();
    offCalendar();
  };
}
