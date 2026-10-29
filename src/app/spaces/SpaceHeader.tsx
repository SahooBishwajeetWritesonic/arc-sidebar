import { motion } from 'motion/react';
import { createSpace, deleteSpace, newLiveFolder, renameSpace, setSpaceIcon } from '@/app/actions';
import { spring } from '@/app/motion';
import { InlineEdit } from '@/app/rows/InlineEdit';
import { openThemePicker } from '@/app/theme/ThemePicker';
import { RowMenu, type MenuEntry } from '@/app/rows/RowMenu';
import { githubFolderOf } from '@/model/live';
import { useSidebar } from '@/state/sidebar';
import { startEditing, stopEditing, useUi } from '@/state/ui';
import { EMOJIS, SpaceGlyph, SYMBOLS } from './icons';
import styles from './spaces.module.css';

const titleCase = (name: string) => name[0]!.toUpperCase() + name.slice(1);

export function SpaceHeader({ spaceId }: { spaceId: string }) {
  const space = useSidebar((state) => state.model.spaces.find((s) => s.id === spaceId));
  const canDelete = useSidebar((state) => state.model.spaces.length > 1);
  const editing = useUi((state) => state.editingId === spaceId);
  const hasLiveFolder = useSidebar((state) => githubFolderOf(state.model) !== undefined);
  if (!space) return null;

  const menu: MenuEntry[] = [
    { label: 'Rename…', onSelect: () => startEditing(spaceId) },
    { label: 'Edit Theme…', onSelect: () => openThemePicker(spaceId) },
    {
      label: 'Symbol',
      submenu: Object.entries(SYMBOLS).map(([name, Symbol]) => ({
        label: titleCase(name),
        icon: <Symbol size={14} strokeWidth={1.75} />,
        onSelect: () => setSpaceIcon(spaceId, { type: 'symbol', name }),
      })),
    },
    {
      label: 'Emoji',
      submenu: EMOJIS.map((char) => ({
        label: char,
        onSelect: () => setSpaceIcon(spaceId, { type: 'emoji', char }),
      })),
    },
    ...(space.icon ? [{ label: 'Remove Icon', onSelect: () => setSpaceIcon(spaceId, null) }] : []),
    'separator',
    // Arc turns its GitHub Live Folder back on from the sidebar's menu.
    ...(hasLiveFolder ? [] : [{ label: 'New GitHub Live Folder', onSelect: newLiveFolder }]),
    { label: 'New Space', onSelect: () => createSpace() },
    ...(canDelete
      ? [{ label: 'Delete Space', onSelect: () => deleteSpace(spaceId), danger: true }]
      : []),
  ];

  return (
    <motion.div layout="position" transition={{ layout: spring.row }} data-space-header={spaceId}>
      <RowMenu items={menu} className={styles.header}>
        <span className={styles.glyph}>
          <SpaceGlyph icon={space.icon} />
        </span>
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
