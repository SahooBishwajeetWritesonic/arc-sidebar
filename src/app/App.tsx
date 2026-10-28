import { LayoutGroup, MotionConfig } from 'motion/react';
import type { KeyboardEvent } from 'react';
import { closePin, moveByKeyboard, pressPin, setFolderCollapsed } from '@/app/actions';
import { useSidebar } from '@/state/sidebar';
import { activateTab, closeTab, openNewTab, useTabs } from '@/state/tabs';
import { DragLayer } from './drag/DragLayer';
import { Pinned } from './pinned/Pinned';
import { Today } from './today/Today';

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
  if (kind === 'tab') closeTab(Number(id));
  if (kind === 'pin') closePin(id);
}

function onKeyDown(event: KeyboardEvent<HTMLElement>) {
  const rows = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-nav-row]')];
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
  return (
    // reducedMotion="user": with Reduce Motion on, movement is skipped and fades stay.
    <MotionConfig reducedMotion="user">
      <main
        data-sidebar
        style={{ position: 'relative', padding: '8px var(--pad-side)', color: 'var(--ink)' }}
        onKeyDown={onKeyDown}
      >
        {ready && (
          // One group, so rows in every section slide together when any changes.
          <LayoutGroup>
            <Pinned />
            <Today />
          </LayoutGroup>
        )}
        <DragLayer />
      </main>
    </MotionConfig>
  );
}
