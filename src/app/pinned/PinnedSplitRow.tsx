import { memo, useRef, type PointerEvent, type Ref } from 'react';
import { Volume2, VolumeX, X } from 'lucide-react';
import {
  closePin,
  closePinnedSplit,
  moveItemToSpace,
  pressPinnedSplit,
  separatePinnedSplit,
  unpinSplit,
} from '@/app/actions';
import { Favicon } from '@/app/rows/Favicon';
import { IconSwap } from '@/app/rows/IconSwap';
import { Row } from '@/app/rows/Row';
import { Title } from '@/app/rows/Title';
import styles from '@/app/rows/rows.module.css';
import { moveToSpaceMenu } from '@/app/spaces/move-menu';
import type { PinItem } from '@/model/types';
import type { TabInfo } from '@/platform/types';
import { useSidebar } from '@/state/sidebar';
import { faviconFor, toggleMuted, useTabs } from '@/state/tabs';

const stop = (event: PointerEvent) => event.stopPropagation();

interface PinnedSplitRowProps {
  /** The two pins, left then right. */
  pair: [string, string];
  depth: number;
  ref?: Ref<HTMLLIElement>;
}

/**
 * Arc's pinned Split View: two pins in one pill. Pressing a pane opens both side by side
 * in Chrome and selects that one; each pane closes on its own.
 */
export const PinnedSplitRow = memo(function PinnedSplitRow({
  pair,
  depth,
  ref,
}: PinnedSplitRowProps) {
  const [leftId, rightId] = pair;
  const left = usePane(leftId);
  const right = usePane(rightId);
  const tabIds = [left.tab?.id, right.tab?.id].filter((id) => id !== undefined);
  const activeId = useTabs((state) =>
    state.activeId !== null && tabIds.includes(state.activeId) ? state.activeId : null,
  );
  const previous = useTabs(
    (state) => state.previousId !== null && tabIds.includes(state.previousId),
  );
  const spaces = useSidebar((state) => state.model.spaces);
  // The pane under the pointer, set as the press reaches the row.
  const pressed = useRef(leftId);
  if (!left.pin || !right.pin) return null;

  const pane = (itemId: string, pin: PinItem, tab: TabInfo | undefined) => (
    <span
      className={styles.pane}
      data-pane
      data-active={(tab !== undefined && activeId === tab.id) || undefined}
      onPointerDown={() => (pressed.current = itemId)}
    >
      <Favicon url={tab?.url ?? pin.url} loading={!!tab?.loading && !tab.favIconUrl} />
      <Title text={pin.customTitle ?? tab?.title ?? pin.title} className={styles.paneTitle} />
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
    </span>
  );

  const open = left.tab !== undefined || right.tab !== undefined;
  return (
    <Row
      ref={ref}
      kind="pin"
      id={leftId}
      depth={depth}
      parentId={left.pin.parentId}
      selected={activeId !== null}
      previous={previous}
      onPress={() => {
        pressPinnedSplit(pair, pressed.current);
        pressed.current = leftId;
      }}
      onMiddleClick={() => closePinnedSplit(pair)}
      drag={{
        // Both move, in order, as a selection of the two would.
        source: {
          kind: 'many',
          itemIds: [leftId, rightId],
          tabIds: [],
          bound: left.tab !== undefined && right.tab !== undefined,
          pinnable: true,
        },
        ghost: () => ({
          title: `${left.pin!.customTitle ?? left.pin!.title} | ${right.pin!.customTitle ?? right.pin!.title}`,
          faviconUrl: faviconFor(left.tab?.url ?? left.pin!.url),
          folder: false,
        }),
      }}
      menu={[
        { label: 'Separate All Tabs', onSelect: () => separatePinnedSplit(pair) },
        ...moveToSpaceMenu(spaces, left.pin.spaceId, (target) => {
          moveItemToSpace(leftId, target);
          moveItemToSpace(rightId, target);
        }),
        'separator',
        ...(open ? [{ label: 'Close Split', onSelect: () => closePinnedSplit(pair) }] : []),
        { label: 'Unpin Split', onSelect: () => unpinSplit(pair), danger: true },
      ]}
    >
      {pane(leftId, left.pin, left.tab)}
      {pane(rightId, right.pin, right.tab)}
    </Row>
  );
});

/** A pane's pin (its last state while the row fades out) and its open tab, if any. */
function usePane(itemId: string) {
  const item = useSidebar((state) => state.model.items[itemId]);
  const tabId = useSidebar((state) => state.session.bindings[itemId]);
  const tab = useTabs((state) => (tabId === undefined ? undefined : state.tabs.get(tabId)));
  const last = useRef<PinItem | undefined>(undefined);
  if (item?.kind === 'pin') last.current = item;
  return { pin: last.current, tab };
}
