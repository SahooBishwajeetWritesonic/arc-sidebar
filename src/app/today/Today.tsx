import { AnimatePresence } from 'motion/react';
import type { KeyboardEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { activateTab, closeTab, selectTodayIds, useTabs } from '@/state/tabs';
import { NewTabRow } from './NewTabRow';
import { TabRow } from './TabRow';
import styles from './today.module.css';

export function Today() {
  const ids = useTabs(useShallow(selectTodayIds));
  const hasActive = useTabs((state) => state.activeId !== null && state.tabs.has(state.activeId));

  function onKeyDown(event: KeyboardEvent<HTMLUListElement>) {
    const rows = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-tab-id]')];
    const index = rows.findIndex((row) => row === document.activeElement);
    if (index === -1) return;
    const id = Number(rows[index]!.dataset.tabId);
    const focusRow = (i: number) => rows[Math.max(0, Math.min(rows.length - 1, i))]?.focus();

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
        activateTab(id);
        break;
      case 'Delete':
      case 'Backspace':
        closeTab(id);
        focusRow(index + 1 < rows.length ? index + 1 : index - 1);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  return (
    <section aria-label="Today" className={styles.today}>
      <NewTabRow />
      <ul role="listbox" aria-label="Today tabs" className={styles.list} onKeyDown={onKeyDown}>
        <AnimatePresence initial={false} mode="popLayout">
          {ids.map((id, index) => (
            <TabRow
              key={id}
              id={id}
              index={index}
              focusable={hasActive ? undefined : index === 0}
            />
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
