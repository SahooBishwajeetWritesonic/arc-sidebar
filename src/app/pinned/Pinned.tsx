import { AnimatePresence, motion } from 'motion/react';
import { useMemo } from 'react';
import { clearToday } from '@/app/actions';
import { spring } from '@/app/motion';
import { LayoutKey } from '@/app/rows/layout-key';
import styles from '@/app/rows/rows.module.css';
import { flattenSpace } from '@/model/tree';
import { useSidebar } from '@/state/sidebar';
import { selectTodayIds, useTabs } from '@/state/tabs';
import { FolderRow } from './FolderRow';
import { PinRow } from './PinRow';

export function Pinned({ spaceId }: { spaceId: string }) {
  const model = useSidebar((state) => state.model);
  const bindings = useSidebar((state) => state.session.bindings);
  const activeId = useTabs((state) => state.activeId);
  const canClear = useTabs((state) =>
    selectTodayIds(state, spaceId).some((id) => !state.tabs.get(id)?.audible),
  );

  const rows = useMemo(
    () => flattenSpace(model, spaceId, (item) => bindings[item.id] === activeId),
    [model, spaceId, bindings, activeId],
  );
  const layoutKey = rows.map(({ item, depth }) => `${item.id}:${depth}`).join();

  return (
    <section aria-label="Pinned">
      <ul role="listbox" aria-label="Pinned tabs" className={styles.list}>
        <LayoutKey value={layoutKey}>
          <AnimatePresence initial={false} mode="popLayout">
            {rows.map(({ item, depth }) =>
              item.kind === 'folder' ? (
                <FolderRow key={item.id} itemId={item.id} depth={depth} />
              ) : (
                <PinRow key={item.id} itemId={item.id} depth={depth} />
              ),
            )}
          </AnimatePresence>
        </LayoutKey>
      </ul>
      <motion.div
        layout="position"
        layoutDependency={layoutKey}
        transition={{ layout: spring.row }}
        className={styles.divider}
        data-can-clear={canClear || undefined}
      >
        <div className={styles.line} role="separator" />
        {canClear && (
          <button
            type="button"
            className={styles.clear}
            title="Archive all Today tabs (⌘⇧K)"
            onClick={clearToday}
          >
            Clear
          </button>
        )}
      </motion.div>
    </section>
  );
}
