import { memo, useRef, type Ref } from 'react';
import { Folder, FolderOpen } from 'lucide-react';
import { deleteFolder, moveItemToSpace, renameItem, setFolderCollapsed } from '@/app/actions';
import { InlineEdit } from '@/app/rows/InlineEdit';
import { Row } from '@/app/rows/Row';
import styles from '@/app/rows/rows.module.css';
import { moveToSpaceMenu } from '@/app/spaces/move-menu';
import type { FolderItem } from '@/model/types';
import { useSidebar } from '@/state/sidebar';
import { startEditing, stopEditing, useUi } from '@/state/ui';

interface FolderRowProps {
  itemId: string;
  depth: number;
  ref?: Ref<HTMLLIElement>;
}

export const FolderRow = memo(function FolderRow({ itemId, depth, ref }: FolderRowProps) {
  const item = useSidebar((state) => state.model.items[itemId]);
  const editing = useUi((state) => state.editingId === itemId);
  const spaces = useSidebar((state) => state.model.spaces);

  const last = useRef<FolderItem | undefined>(undefined);
  if (item?.kind === 'folder') last.current = item;
  const folder = last.current;
  if (!folder) return null;

  const Icon = folder.collapsed ? Folder : FolderOpen;
  return (
    <Row
      ref={ref}
      kind="folder"
      id={itemId}
      depth={depth}
      parentId={folder.parentId}
      open={!folder.collapsed}
      // Arc toggles on press; on release here, so a drag never toggles it.
      onTap={() => setFolderCollapsed(itemId, !folder.collapsed)}
      drag={{
        source: { kind: 'folder', itemId },
        ghost: () => ({ title: folder.name, folder: true }),
      }}
      menu={[
        { label: 'Rename…', onSelect: () => startEditing(itemId) },
        ...moveToSpaceMenu(spaces, folder.spaceId, (target) => moveItemToSpace(itemId, target)),
        'separator',
        { label: 'Delete Folder', onSelect: () => deleteFolder(itemId), danger: true },
      ]}
    >
      <Icon className={styles.favicon} size={16} strokeWidth={1.75} aria-hidden />
      {editing ? (
        <InlineEdit
          initial={folder.name}
          onCommit={(value) => {
            renameItem(itemId, value);
            stopEditing();
          }}
          onCancel={stopEditing}
        />
      ) : (
        <span className={`${styles.title} ${styles.folderTitle}`}>{folder.name}</span>
      )}
    </Row>
  );
});
