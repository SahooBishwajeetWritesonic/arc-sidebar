import { useSidebar } from '@/state/sidebar';
import { useTabs } from '@/state/tabs';
import { CommandBar, type CommandHost } from './CommandBar';
import './little.css';

/**
 * A new Little Arc: the bar at the top of the small window, where what's chosen loads.
 * It waits for the data so it opens in the right colours.
 */
export function LittlePage({ host }: { host: CommandHost }) {
  const tabsReady = useTabs((state) => state.ready);
  const sidebarReady = useSidebar((state) => state.ready);
  if (!tabsReady || !sidebarReady) return null;
  return <CommandBar host={host} sidebarOpen={false} placement="sidebar" address="" pagesOnly />;
}
