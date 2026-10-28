import { memo, useRef, type PointerEvent, type Ref } from 'react';
import { Volume2, VolumeX, X } from 'lucide-react';
import {
  closePin,
  newFolderWith,
  pressPin,
  renameItem,
  replacePinUrl,
  resetPin,
  unpinWithUndo,
} from '@/app/actions';
import { Favicon } from '@/app/rows/Favicon';
import { InlineEdit } from '@/app/rows/InlineEdit';
import type { MenuEntry } from '@/app/rows/RowMenu';
import { Row } from '@/app/rows/Row';
import styles from '@/app/rows/rows.module.css';
import type { PinItem } from '@/model/types';
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

  // Keep drawing the last state while the row fades out after an unpin.
  const last = useRef<PinItem | undefined>(undefined);
  if (item?.kind === 'pin') last.current = item;
  const pin = last.current;
  if (!pin) return null;

  const awayFromPin = tab !== undefined && !isSamePage(tab.url, pin.url);
  const title = awayFromPin ? tab.title : (pin.customTitle ?? tab?.title ?? pin.title);

  const menu: MenuEntry[] = [
    { label: 'Rename…', onSelect: () => startEditing(itemId) },
    ...(awayFromPin
      ? [
          { label: 'Back to Pinned URL', onSelect: () => resetPin(itemId) },
          { label: 'Replace Pinned URL with Current', onSelect: () => replacePinUrl(itemId) },
        ]
      : []),
    { label: 'New Folder with Tab', onSelect: () => newFolderWith(itemId) },
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
      drag={{
        source: { kind: 'pin', itemId, bound: tab !== undefined },
        ghost: () => ({ title, faviconUrl: faviconFor(tab?.url ?? pin.url), folder: false }),
      }}
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
                if (event.button !== 0) return;
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
        <span className={styles.title}>{title}</span>
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
          {tab.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
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
