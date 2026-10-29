import { AnimatePresence } from 'motion/react';
import { useShallow } from 'zustand/react/shallow';
import { LayoutKey } from '@/app/rows/layout-key';
import styles from '@/app/rows/rows.module.css';
import { selectTodayIds, useTabs } from '@/state/tabs';
import { NewTabRow } from './NewTabRow';
import { TabRow } from './TabRow';

export function Today({ spaceId }: { spaceId: string }) {
  const ids = useTabs(useShallow((state) => selectTodayIds(state, spaceId)));
  return (
    <section aria-label="Today">
      <NewTabRow />
      <ul role="listbox" aria-label="Today tabs" className={styles.list}>
        <LayoutKey value={ids.join()}>
          <AnimatePresence initial={false} mode="popLayout">
            {ids.map((id) => (
              <TabRow key={id} id={id} />
            ))}
          </AnimatePresence>
        </LayoutKey>
      </ul>
    </section>
  );
}
