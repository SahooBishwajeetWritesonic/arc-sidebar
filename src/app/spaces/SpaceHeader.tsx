import { ChevronRight } from 'lucide-react';
import { motion } from 'motion/react';
import {
  createSpace,
  deleteSpace,
  newLiveFolder,
  renameSpace,
  setPinnedCollapsed,
  setSpaceIcon,
  applyThemeToAllSpaces,
} from '@/app/actions';
import { spring } from '@/app/motion';
import { InlineEdit } from '@/app/rows/InlineEdit';
import { openThemePicker } from '@/app/theme/ThemePicker';
import { RowMenu, type MenuEntry } from '@/app/rows/RowMenu';
import { githubFolderOf } from '@/model/live';
import { useSidebar } from '@/state/sidebar';
import { startEditing, stopEditing, useUi } from '@/state/ui';
import { iconMenu, SpaceGlyph } from './icons';
import styles from './spaces.module.css';

/**
 * Hovering shows Arc's caret in place of the icon, which folds the Pinned section away;
 * the name turns brighter while it's folded.
 */
export function SpaceHeader({ spaceId }: { spaceId: string }) {
  const space = useSidebar((state) => state.model.spaces.find((s) => s.id === spaceId));
  const several = useSidebar((state) => state.model.spaces.length > 1);
  const editing = useUi((state) => state.editingId === spaceId);
  const hasLiveFolder = useSidebar((state) => githubFolderOf(state.model) !== undefined);
  if (!space) return null;
  const collapsed = !!space.pinnedCollapsed;

  const menu: MenuEntry[] = [
    {
      label: collapsed ? 'Expand Pinned' : 'Collapse Pinned',
      onSelect: () => setPinnedCollapsed(spaceId, !collapsed),
    },
    { label: 'Rename…', onSelect: () => startEditing(spaceId) },
    { label: 'Edit Theme…', onSelect: () => openThemePicker(spaceId) },
    ...(space.theme && several
      ? [{ label: 'Use Theme for All Spaces', onSelect: () => applyThemeToAllSpaces(spaceId) }]
      : []),
    ...iconMenu(space.icon, (icon) => setSpaceIcon(spaceId, icon)),
    'separator',
    // Arc turns its GitHub Live Folder back on from the sidebar's menu.
    ...(hasLiveFolder ? [] : [{ label: 'New GitHub Live Folder', onSelect: newLiveFolder }]),
    { label: 'New Space', onSelect: () => createSpace() },
    ...(several
      ? [{ label: 'Delete Space', onSelect: () => deleteSpace(spaceId), danger: true }]
      : []),
  ];

  return (
    <motion.div
      layout="position"
      transition={{ layout: spring.row }}
      data-space-header={spaceId}
      data-collapsed={collapsed || undefined}
    >
      <RowMenu items={menu} className={styles.header}>
        <button
          type="button"
          className={styles.glyph}
          aria-label={collapsed ? 'Expand Pinned' : 'Collapse Pinned'}
          aria-expanded={!collapsed}
          tabIndex={-1}
          onClick={() => setPinnedCollapsed(spaceId, !collapsed)}
        >
          <span className={styles.icon}>
            <SpaceGlyph icon={space.icon} />
          </span>
          <ChevronRight className={styles.caret} size={12} strokeWidth={2.5} aria-hidden />
        </button>
        {editing ? (
          <InlineEdit
            initial={space.name}
            onCommit={(value) => {
              renameSpace(spaceId, value);
              stopEditing();
            }}
            onCancel={stopEditing}
          />
        ) : (
          <span className={styles.name} onDoubleClick={() => startEditing(spaceId)}>
            {space.name}
          </span>
        )}
      </RowMenu>
    </motion.div>
  );
}
