import { useLayoutEffect, useState } from 'react';
import { setCommandBar, useUi } from '@/state/ui';
import { CommandBar, type CommandHost } from './CommandBar';
import { runInSidebar } from './sidebar';

const host: CommandHost = {
  close: () => setCommandBar(false),
  runInSidebar: async (command) => {
    runInSidebar(command);
    return true;
  },
};

/**
 * The command bar inside the sidebar: from "+ New Tab", from the shortcut while the
 * sidebar has focus, and on pages Chrome won't let it cover.
 */
export function SidebarCommandBar() {
  const open = useUi((state) => state.commandBar);
  return open ? <OpenBar /> : null;
}

function OpenBar() {
  // Focus goes back to where it was when the bar closes. Read while
  // rendering: the bar's own effect moves focus before this one's would run.
  const [previous] = useState(() => document.activeElement);
  useLayoutEffect(() => {
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [previous]);
  return <CommandBar host={host} sidebarOpen placement="sidebar" />;
}
