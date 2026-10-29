import { useSidebar } from '@/state/sidebar';
import { useTabs } from '@/state/tabs';
import { CommandBar, type CommandHost } from './CommandBar';
import './page.css';

/** Waits the few ms the sidebar's data takes, so the bar opens in the right colours. */
export function CommandPage({ host, sidebarOpen }: { host: CommandHost; sidebarOpen: boolean }) {
  const tabsReady = useTabs((state) => state.ready);
  const sidebarReady = useSidebar((state) => state.ready);
  if (!tabsReady || !sidebarReady) return null;
  return <CommandBar host={host} sidebarOpen={sidebarOpen} placement="page" />;
}
