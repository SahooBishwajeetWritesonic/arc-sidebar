import { AnimatePresence, motion } from 'motion/react';
import { useMemo } from 'react';
import { clearToday } from '@/app/actions';
import { spring } from '@/app/motion';
import { LayoutKey } from '@/app/rows/layout-key';
import styles from '@/app/rows/rows.module.css';
import { flattenSpace, partnerOf, type Row } from '@/model/tree';
import type { Item } from '@/model/types';
import { useSidebar } from '@/state/sidebar';
import { selectTodayIds, useTabs } from '@/state/tabs';
import { FolderRow } from './FolderRow';
import { PinnedSplitRow } from './PinnedSplitRow';
import { PinRow } from './PinRow';
import { SignInRow } from './SignInRow';

export function Pinned({ spaceId }: { spaceId: string }) {
  const model = useSidebar((state) => state.model);
  const bindings = useSidebar((state) => state.session.bindings);
  const activeId = useTabs((state) => state.activeId);
  const canClear = useTabs((state) =>
    selectTodayIds(state, spaceId).some((id) => !state.tabs.get(id)?.audible),
  );

  const collapsed = useSidebar(
    (state) => state.model.spaces.find((space) => space.id === spaceId)?.pinnedCollapsed,
  );

  const rows = useMemo(() => {
    const isActive = (item: Item) => bindings[item.id] === activeId;
    const all = flattenSpace(model, spaceId, isActive);
    // Folded away like a closed folder: only the selected pinned tab (or split) stays.
    const shown = collapsed
      ? all
          .filter(({ item }) => {
            const partner = partnerOf(model, item);
            return item.kind === 'pin' && (isActive(item) || (partner && isActive(partner)));
          })
          .map((row) => ({ ...row, depth: 0 }))
      : all;
    return pairUp(model, shown);
  }, [model, spaceId, bindings, activeId, collapsed]);
  // An open Live Folder that GitHub says nobody is signed in to starts with a way to sign in.
  const signIn = (item: (typeof rows)[number]['item']) =>
    item.kind === 'folder' && !item.collapsed && item.live?.signedOut === true;
  const layoutKey = rows
    .map(({ item, depth }) => `${item.id}:${depth}${signIn(item) ? ':sign-in' : ''}`)
    .join();

  return (
    <section aria-label="Pinned">
      <ul role="listbox" aria-label="Pinned tabs" aria-multiselectable className={styles.list}>
        <LayoutKey value={layoutKey}>
          <AnimatePresence initial={false} mode="popLayout">
            {rows.flatMap(({ item, depth, partner }) =>
              item.kind === 'folder'
                ? [
                    <FolderRow key={item.id} itemId={item.id} depth={depth} />,
                    signIn(item) && (
                      <SignInRow key={`${item.id}:sign-in`} folderId={item.id} depth={depth + 1} />
                    ),
                  ]
                : [
                    partner ? (
                      <PinnedSplitRow key={item.id} pair={[item.id, partner]} depth={depth} />
                    ) : (
                      <PinRow key={item.id} itemId={item.id} depth={depth} />
                    ),
                  ],
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

/**
 * Each pinned split as one row: the left pin's row carries the right one. A pair split
 * up by a move shows as two pins.
 */
function pairUp(
  model: Parameters<typeof partnerOf>[0],
  rows: Row[],
): (Row & { partner?: string })[] {
  const out: (Row & { partner?: string })[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const next = rows[i + 1];
    const partner = partnerOf(model, row.item);
    if (partner && next?.item.id === partner.id && next.depth === row.depth) {
      out.push({ ...row, partner: partner.id });
      i++;
    } else out.push(row);
  }
  return out;
}
