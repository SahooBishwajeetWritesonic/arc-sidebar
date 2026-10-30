import type { Platform } from '@/platform/types';
import { connectMedia } from './media';
import { connectRecording } from './recording';
import { connectSidebar } from './sidebar';
import { connectTabs } from './tabs';

/**
 * Only the sidebar follows media players; the command bar doesn't need them.
 * Both show which tabs use the mic or camera.
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
  return () => {
    offTabs();
    offSidebar();
    offMedia();
    offRecording();
  };
}
