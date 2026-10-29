import type { Platform } from '@/platform/types';
import { connectMedia } from './media';
import { connectSidebar } from './sidebar';
import { connectTabs } from './tabs';

/** Only the sidebar follows media players; the command bar doesn't need them. */
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
  return () => {
    offTabs();
    offSidebar();
    offMedia();
  };
}
