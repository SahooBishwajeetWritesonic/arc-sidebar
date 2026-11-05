import { exportSidebar } from '@/app/actions';
import { openThemePicker } from '@/app/theme/ThemePicker';
import { showToast } from '@/app/toast/toast';
import type { Command } from '@/command/types';
import { copiedText } from '@/model/links';
import { loadBackups, useSidebar } from '@/state/sidebar';
import {
  openLibrary,
  setClearingArchive,
  setEditingShortcuts,
  setImporting,
  setRestoring,
  showView,
} from '@/state/ui';
import { addSiteSearch } from '@/app/shortcuts/add';
import { useTabs } from '@/state/tabs';
import { runCommand } from './run';

/** Arc's Reveal Tab in Sidebar: scrolls the selected row into view and gives it focus. */
function revealSelected() {
  requestAnimationFrame(() => {
    const row = document.querySelector<HTMLElement>(
      '[data-active-page] [data-nav-row][data-selected]',
    );
    row?.scrollIntoView({ block: 'nearest' });
    row?.focus({ preventScroll: true });
  });
}

/**
 * Runs a row chosen in the command bar, here in the sidebar, so it gets the
 * sidebar's toasts and Undo and can open the sidebar's own views.
 */
export function runInSidebar(command: Command) {
  if (command.type === 'switchSpace') showView('sidebar');
  if (command.type !== 'action') return runCommand(command);

  switch (command.action) {
    case 'copyUrl':
    case 'copyMarkdown':
      // The bar copied it (only a focused page can); this just says so.
      return showToast(copiedText(1, command.action === 'copyMarkdown'));
    case 'viewArchive':
      return openLibrary('archive');
    case 'viewDownloads':
      return openLibrary('downloads');
    case 'clearArchive':
      openLibrary('archive');
      return setClearingArchive(true);
    case 'revealTab':
      showView('sidebar');
      return revealSelected();
    case 'editTheme':
      showView('sidebar');
      return openThemePicker(useSidebar.getState().spaceId);
    case 'addSiteSearch': {
      const { activeId, tabs } = useTabs.getState();
      const tab = activeId === null ? undefined : tabs.get(activeId);
      return tab ? void addSiteSearch(tab) : undefined;
    }
    case 'editShortcuts':
      showView('sidebar');
      return setEditingShortcuts(true);
    case 'restoreSidebar':
      return void loadBackups().then(setRestoring);
    case 'exportSidebar':
      return exportSidebar();
    case 'importArc':
      return setImporting(true);
    default:
      return runCommand(command);
  }
}
