import { memo, useRef, useState, type Ref } from 'react';
import { Folder, FolderOpen } from 'lucide-react';
import {
  deleteFolder,
  deleteLiveFolder,
  moveItemToSpace,
  refreshLiveFolder,
  renameItem,
  setFolderCollapsed,
  setFolderIcon,
  setLiveFilters,
} from '@/app/actions';
import { Favicon } from '@/app/rows/Favicon';
import { IconSwap } from '@/app/rows/IconSwap';
import { InlineEdit } from '@/app/rows/InlineEdit';
import { GitHubFolderIcon } from './LiveIcons';
import type { MenuEntry } from '@/app/rows/RowMenu';
import { Row } from '@/app/rows/Row';
import { Title } from '@/app/rows/Title';
import styles from '@/app/rows/rows.module.css';
import { iconMenu, SpaceGlyph } from '@/app/spaces/icons';
import { moveToSpaceMenu } from '@/app/spaces/move-menu';
import { knownRepos, type LiveFolderItem } from '@/model/live';
import type { FolderItem, GitHubFilters } from '@/model/types';
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
  const [refreshing, setRefreshing] = useState(false);

  const last = useRef<FolderItem | undefined>(undefined);
  if (item?.kind === 'folder') last.current = item;
  const folder = last.current;
  if (!folder) return null;

  const refresh = () => {
    setRefreshing(true);
    void refreshLiveFolder(itemId).finally(() => setRefreshing(false));
  };
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
        ghost: () => ({ title: folder.name, folder: true, icon: folder.icon }),
      }}
      menu={[
        ...(folder.live
          ? [
              pullRequestsMenu({ ...folder, live: folder.live }),
              { label: 'Refresh', onSelect: refresh },
              'separator' as const,
            ]
          : []),
        { label: 'Rename…', onSelect: () => startEditing(itemId) },
        ...(folder.live
          ? []
          : [
              {
                label: 'Change Icon',
                submenu: iconMenu(folder.icon, (icon) => setFolderIcon(itemId, icon)),
              },
            ]),
        ...moveToSpaceMenu(spaces, folder.spaceId, (target) => moveItemToSpace(itemId, target)),
        'separator',
        folder.live
          ? { label: 'Delete Live Folder', onSelect: () => deleteLiveFolder(itemId), danger: true }
          : { label: 'Delete Folder', onSelect: () => deleteFolder(itemId), danger: true },
      ]}
    >
      {refreshing ? (
        // The same spinner as a loading tab, while GitHub answers.
        <Favicon url="" loading />
      ) : folder.live ? (
        <GitHubFolderIcon open={!folder.collapsed} />
      ) : folder.icon ? (
        <span className={styles.folderIcon} aria-hidden>
          <SpaceGlyph icon={folder.icon} />
        </span>
      ) : (
        <span className={styles.folderIcon} aria-hidden>
          <IconSwap
            on={!folder.collapsed}
            off={<Folder size={16} strokeWidth={1.75} />}
            to={<FolderOpen size={16} strokeWidth={1.75} />}
          />
        </span>
      )}
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
        <Title text={folder.name} className={styles.folderTitle} />
      )}
    </Row>
  );
});

/** Arc's filters for the GitHub Live Folder, ticked when on. */
function pullRequestsMenu(folder: LiveFolderItem): MenuEntry {
  const { filters } = folder.live;
  const set = (change: Partial<GitHubFilters>) =>
    setLiveFilters(folder.id, { ...filters, ...change });
  const toggleRepo = (repo: string) =>
    set({
      repos: filters.repos.includes(repo)
        ? filters.repos.filter((chosen) => chosen !== repo)
        : [...filters.repos, repo],
    });
  const repos = knownRepos(folder);
  return {
    label: 'Pull Requests',
    submenu: [
      {
        label: 'Created by Me',
        checked: filters.createdByMe,
        onSelect: () => set({ createdByMe: !filters.createdByMe }),
      },
      {
        label: 'Review Requests',
        checked: filters.reviewRequests,
        onSelect: () => set({ reviewRequests: !filters.reviewRequests }),
      },
      {
        label: 'Drafts',
        checked: filters.drafts,
        onSelect: () => set({ drafts: !filters.drafts }),
      },
      ...(repos.length
        ? [
            'separator' as const,
            {
              label: 'All Repositories',
              checked: !filters.repos.length,
              onSelect: () => set({ repos: [] }),
            },
            ...repos.map((repo) => ({
              label: repo,
              checked: filters.repos.includes(repo),
              onSelect: () => toggleRepo(repo),
            })),
          ]
        : []),
    ],
  };
}
