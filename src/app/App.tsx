import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import type { KeyboardEvent } from 'react';
import {
  clearToday,
  closePin,
  closeTodayTab,
  moveByKeyboard,
  pressPin,
  setFolderCollapsed,
  switchSpace,
  switchSpaceBy,
} from '@/app/actions';
import { useSidebar } from '@/state/sidebar';
import { activateTab, openNewTab, useTabs } from '@/state/tabs';
import { useUi } from '@/state/ui';
import { ArchiveView } from './archive/ArchiveView';
import { BottomBar } from './chrome/BottomBar';
import { DragLayer } from './drag/DragLayer';
import { Favorites } from './favorites/Favorites';
import { ImportDialog } from './import/ImportDialog';
import { fade } from './motion';
import styles from './app.module.css';
import { SpacePager } from './spaces/SpacePager';
import { Backdrop } from './theme/Backdrop';
import { useRootScheme, useSpaceLooks } from './theme/looks';
import { ThemePicker } from './theme/ThemePicker';
import { ToastLayer } from './toast/ToastLayer';

/** Enter on a row does what a click does. */
function press(kind: string, id: string) {
  if (kind === 'tab') activateTab(Number(id));
  if (kind === 'pin') pressPin(id);
  if (kind === 'newtab') openNewTab();
  if (kind === 'folder') {
    const folder = useSidebar.getState().model.items[id];
    if (folder?.kind === 'folder') setFolderCollapsed(id, !folder.collapsed);
  }
}

/** Delete closes a tab (pinned tabs keep their pin). */
function remove(kind: string, id: string) {
  if (kind === 'tab') closeTodayTab(Number(id));
  if (kind === 'pin') closePin(id);
}

function onKeyDown(event: KeyboardEvent<HTMLElement>) {
  // Arc's Clear: ⌘⇧K (only while the panel has focus; Chrome keeps it otherwise).
  if (event.metaKey && event.shiftKey && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    clearToday();
    return;
  }

  // Spaces, as in Arc: ⌃1–9 jumps to one, ⌘⌥←/→ steps through them.
  if (event.ctrlKey && !event.metaKey && /^Digit[1-9]$/.test(event.code)) {
    const space = useSidebar.getState().model.spaces[Number(event.code.slice(5)) - 1];
    if (space) switchSpace(space.id);
    event.preventDefault();
    return;
  }
  if (event.metaKey && event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    switchSpaceBy(event.key === 'ArrowLeft' ? -1 : 1);
    event.preventDefault();
    return;
  }

  const page = event.currentTarget.querySelector('[data-active-page]') ?? event.currentTarget;
  const rows = [...page.querySelectorAll<HTMLElement>('[data-nav-row]')];
  const index = rows.findIndex((row) => row === document.activeElement);
  if (index === -1) return;
  const row = rows[index]!;
  const kind = row.dataset.navRow!;
  const id = row.dataset.rowId ?? '';
  const focusRow = (i: number) => rows[Math.max(0, Math.min(rows.length - 1, i))]?.focus();

  if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    event.preventDefault();
    moveByKeyboard(kind, id, event.key === 'ArrowUp' ? -1 : 1);
    // React moves the row's element, which drops focus; put it back.
    const sidebar = event.currentTarget;
    requestAnimationFrame(() =>
      sidebar
        .querySelector<HTMLElement>(`[data-nav-row][data-row-id="${CSS.escape(id)}"]`)
        ?.focus(),
    );
    return;
  }

  switch (event.key) {
    case 'ArrowDown':
      focusRow(index + 1);
      break;
    case 'ArrowUp':
      focusRow(index - 1);
      break;
    case 'Home':
      focusRow(0);
      break;
    case 'End':
      focusRow(rows.length - 1);
      break;
    case 'Enter':
    case ' ':
      press(kind, id);
      break;
    case 'Delete':
    case 'Backspace':
      remove(kind, id);
      focusRow(index + 1 < rows.length ? index + 1 : index - 1);
      break;
    default:
      return;
  }
  event.preventDefault();
}

export function App() {
  const tabsReady = useTabs((state) => state.ready);
  const sidebarReady = useSidebar((state) => state.ready);
  const ready = tabsReady && sidebarReady;
  const view = useUi((state) => state.view);
  const spaceId = useSidebar((state) => state.spaceId);
  const looks = useSpaceLooks();
  useRootScheme(ready ? looks[spaceId]?.scheme : undefined);

  return (
    // reducedMotion="user": with Reduce Motion on, movement is skipped and fades stay.
    <MotionConfig reducedMotion="user">
      {/* As in Arc, the sidebar scrolls above a transparent bottom bar. */}
      <div className={styles.shell}>
        {ready && <Backdrop looks={looks} />}
        <main data-sidebar className={styles.sidebar} onKeyDown={onKeyDown}>
          {ready && (
            <AnimatePresence mode="wait" initial={false}>
              {view === 'archive' ? (
                <motion.div
                  key="archive"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={fade}
                >
                  <ArchiveView />
                </motion.div>
              ) : (
                <motion.div
                  key="sidebar"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={fade}
                >
                  <Favorites />
                  <SpacePager looks={looks} />
                </motion.div>
              )}
            </AnimatePresence>
          )}
          <DragLayer />
        </main>
        <BottomBar />
      </div>
      <ToastLayer />
      <ThemePicker />
      <ImportDialog />
    </MotionConfig>
  );
}
