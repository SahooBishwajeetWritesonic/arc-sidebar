import type { Platform } from '@/platform/types';
import { connectSidebar } from './sidebar';
import { connectTabs } from './tabs';

export async function connect(platform: Platform): Promise<() => void> {
  const windowId = await platform.currentWindowId();
  const [offTabs, offSidebar] = await Promise.all([
    connectTabs(platform, windowId),
    connectSidebar(platform, windowId),
  ]);
  return () => {
    offTabs();
    offSidebar();
  };
}
