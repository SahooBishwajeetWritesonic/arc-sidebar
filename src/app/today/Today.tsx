import { AnimatePresence } from 'motion/react';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { LayoutKey } from '@/app/rows/layout-key';
import styles from '@/app/rows/rows.module.css';
import { selectTodayIds, todayRows, useTabs } from '@/state/tabs';
import { NewTabRow } from './NewTabRow';
import { SplitRow } from './SplitRow';
import { TabRow } from './TabRow';

export function Today({ spaceId }: { spaceId: string }) {
  const ids = useTabs(useShallow((state) => selectTodayIds(state, spaceId)));
  // Only which split each tab is in; other changes to a tab don't rebuild the list.
  const splits = useTabs(useShallow((state) => ids.map((id) => state.tabs.get(id)?.splitViewId)));
  const rows = useMemo(() => {
    const splitOf = new Map(ids.map((id, i) => [id, splits[i]]));
    return todayRows(ids, (id) => splitOf.get(id));
  }, [ids, splits]);
  const layoutKey = rows.map((row) => (row.kind === 'tab' ? row.id : row.ids.join('+'))).join();
  return (
    <section aria-label="Today">
      <NewTabRow />
      <ul role="listbox" aria-label="Today tabs" aria-multiselectable className={styles.list}>
        <LayoutKey value={layoutKey}>
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map((row) =>
              row.kind === 'tab' ? (
                <TabRow key={row.id} id={row.id} />
              ) : (
                <SplitRow
                  key={`split:${row.splitViewId}`}
                  ids={row.ids}
                  splitViewId={row.splitViewId}
                />
              ),
            )}
          </AnimatePresence>
        </LayoutKey>
      </ul>
    </section>
  );
}
