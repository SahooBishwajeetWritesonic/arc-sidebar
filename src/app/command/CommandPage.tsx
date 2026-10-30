import { useSidebar } from '@/state/sidebar';
import { useTabs } from '@/state/tabs';
import { CommandBar, type CommandBarHandle, type CommandHost } from './CommandBar';
import './page.css';

/**
 * The bar over a page, in its own transparent frame. It waits for the sidebar's data so it
 * opens in the right colours; the page's stand-in shows the field meanwhile.
 */
export function CommandPage({
  host,
  sidebarOpen,
  address,
  onMount,
}: {
  host: CommandHost;
  sidebarOpen: boolean;
  /** Opened to edit the tab's address (Arc's ⌘L). */
  address?: string;
  onMount?: (bar: CommandBarHandle) => void;
}) {
  const tabsReady = useTabs((state) => state.ready);
  const sidebarReady = useSidebar((state) => state.ready);
  if (!tabsReady || !sidebarReady) return null;
  return (
    <CommandBar
      host={host}
      sidebarOpen={sidebarOpen}
      placement="page"
      address={address}
      onMount={onMount}
    />
  );
}
