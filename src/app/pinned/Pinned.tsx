import { AnimatePresence, motion } from 'motion/react';
import { useMemo } from 'react';
import { spring } from '@/app/motion';
import styles from '@/app/rows/rows.module.css';
import { flattenSpace } from '@/model/tree';
import { useSidebar } from '@/state/sidebar';
import { useTabs } from '@/state/tabs';
import { FolderRow } from './FolderRow';
import { PinRow } from './PinRow';

export function Pinned() {
  const model = useSidebar((state) => state.model);
  const bindings = useSidebar((state) => state.session.bindings);
  const spaceId = useSidebar((state) => state.spaceId);
  const activeId = useTabs((state) => state.activeId);

  const rows = useMemo(
    () => flattenSpace(model, spaceId, (item) => bindings[item.id] === activeId),
    [model, spaceId, bindings, activeId],
  );

  return (
    <section aria-label="Pinned">
      <ul role="listbox" aria-label="Pinned tabs" className={styles.list}>
        <AnimatePresence initial={false} mode="popLayout">
          {rows.map(({ item, depth }) =>
            item.kind === 'folder' ? (
              <FolderRow key={item.id} itemId={item.id} depth={depth} />
            ) : (
              <PinRow key={item.id} itemId={item.id} depth={depth} />
            ),
          )}
        </AnimatePresence>
      </ul>
      <motion.div
        layout="position"
        transition={{ layout: spring.row }}
        className={styles.divider}
        role="separator"
      />
    </section>
  );
}
