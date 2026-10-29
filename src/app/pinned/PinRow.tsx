import { memo, useRef, type PointerEvent, type Ref } from 'react';
import { Volume2, VolumeX, X } from 'lucide-react';
import {
  closePin,
  favoriteItem,
  moveItemToSpace,
  newFolderWith,
  pressPin,
  renameItem,
  replacePinUrl,
  resetPin,
  unpinWithUndo,
} from '@/app/actions';
import { Favicon } from '@/app/rows/Favicon';
import { IconSwap } from '@/app/rows/IconSwap';
import { InlineEdit } from '@/app/rows/InlineEdit';
import { isPress } from '@/app/drag/drag';
import type { MenuEntry } from '@/app/rows/RowMenu';
import { Row } from '@/app/rows/Row';
import { Title } from '@/app/rows/Title';
import styles from '@/app/rows/rows.module.css';
import { moveToSpaceMenu } from '@/app/spaces/move-menu';
import { FAVORITES_ID, FAVORITES_LIMIT, type PinItem } from '@/model/types';
import { isSamePage } from '@/model/urls';
import { useSidebar } from '@/state/sidebar';
import { faviconFor, toggleMuted, useTabs } from '@/state/tabs';
import { startEditing, stopEditing, useUi } from '@/state/ui';

const stop = (event: PointerEvent) => event.stopPropagation();

interface PinRowProps {
  itemId: string;
  depth: number;
  ref?: Ref<HTMLLIElement>;
}

export const PinRow = memo(function PinRow({ itemId, depth, ref }: PinRowProps) {
  const item = useSidebar((state) => state.model.items[itemId]);
  const tabId = useSidebar((state) => state.session.bindings[itemId]);
  const tab = useTabs((state) => (tabId === undefined ? undefined : state.tabs.get(tabId)));
  const selected = useTabs((state) => tabId !== undefined && state.activeId === tabId);
  const previous = useTabs((state) => tabId !== undefined && state.previousId === tabId);
  const editing = useUi((state) => state.editingId === itemId);
  const spaces = useSidebar((state) => state.model.spaces);
  const canFavorite = useSidebar(
    (state) =>
      Object.values(state.model.items).filter((item) => item.spaceId === FAVORITES_ID).length <
      FAVORITES_LIMIT,
  );

  // Keep drawing the last state while the row fades out after an unpin.
  const last = useRef<PinItem | undefined>(undefined);
  if (item?.kind === 'pin') last.current = item;
  const pin = last.current;
  if (!pin) return null;

  const awayFromPin = tab !== undefined && !isSamePage(tab.url, pin.url);
  // A Live Folder's pull request keeps its title rather than GitHub's longer page title.
  const saved = pin.live ? pin.title : (tab?.title ?? pin.title);
  const title = awayFromPin ? tab.title : (pin.customTitle ?? saved);

  // A Live Folder's pull requests stay in it: no moving, favoriting or unpinning.
  const liveMenu: MenuEntry[] = [
    { label: 'Rename…', onSelect: () => startEditing(itemId) },
    ...(awayFromPin ? [{ label: 'Back to Pull Request', onSelect: () => resetPin(itemId) }] : []),
    ...(tab
      ? ['separator' as const, { label: 'Close Tab', onSelect: () => closePin(itemId) }]
      : []),
  ];
  const menu: MenuEntry[] = pin.live
    ? liveMenu
    : [
        { label: 'Rename…', onSelect: () => startEditing(itemId) },
        ...(awayFromPin
          ? [
              { label: 'Back to Pinned URL', onSelect: () => resetPin(itemId) },
              { label: 'Replace Pinned URL with Current', onSelect: () => replacePinUrl(itemId) },
            ]
          : []),
        { label: 'New Folder with Tab', onSelect: () => newFolderWith(itemId) },
        ...(canFavorite
          ? [{ label: 'Add to Favorites', onSelect: () => favoriteItem(itemId) }]
          : []),
        ...moveToSpaceMenu(spaces, pin.spaceId, (target) => moveItemToSpace(itemId, target)),
        'separator',
        ...(tab ? [{ label: 'Close Tab', onSelect: () => closePin(itemId) }] : []),
        { label: 'Unpin', onSelect: () => unpinWithUndo(itemId), danger: true },
      ];

  return (
    <Row
      ref={ref}
      kind="pin"
      id={itemId}
      depth={depth}
      parentId={pin.parentId}
      selected={selected}
      previous={previous}
      onPress={tab ? () => pressPin(itemId) : undefined}
      onTap={tab ? undefined : () => pressPin(itemId)}
      drag={
        pin.live
          ? undefined
          : {
              source: { kind: 'pin', itemId, bound: tab !== undefined },
              ghost: () => ({ title, faviconUrl: faviconFor(tab?.url ?? pin.url), folder: false }),
            }
      }
      onMiddleClick={() => closePin(itemId)}
      onDoubleClick={() => startEditing(itemId)}
      menu={menu}
    >
      <span
        className={styles.faviconButton}
        data-resettable={awayFromPin || undefined}
        title={awayFromPin ? 'Back to pinned URL' : undefined}
        onPointerDown={
          awayFromPin
            ? (event) => {
                if (!isPress(event)) return;
                event.stopPropagation();
                resetPin(itemId);
              }
            : undefined
        }
      >
        <Favicon url={tab?.url ?? pin.url} loading={!!tab?.loading && !tab.favIconUrl} />
      </span>
      {awayFromPin && <span className={styles.slash}>/</span>}
      {editing ? (
        <InlineEdit
          initial={pin.customTitle ?? title}
          onCommit={(value) => {
            renameItem(itemId, value);
            stopEditing();
          }}
          onCancel={stopEditing}
        />
      ) : (
        <Title text={title} />
      )}
      {tab && (tab.audible || tab.muted) && (
        <button
          type="button"
          className={styles.accessory}
          aria-label={tab.muted ? 'Unmute tab' : 'Mute tab'}
          tabIndex={-1}
          onPointerDown={stop}
          onClick={() => toggleMuted(tab.id)}
        >
          <IconSwap on={tab.muted} off={<Volume2 size={14} />} to={<VolumeX size={14} />} />
        </button>
      )}
      {tab && (
        <button
          type="button"
          className={`${styles.accessory} ${styles.close}`}
          aria-label="Close tab"
          tabIndex={-1}
          onPointerDown={stop}
          onClick={() => closePin(itemId)}
        >
          <X size={14} />
        </button>
      )}
    </Row>
  );
});
