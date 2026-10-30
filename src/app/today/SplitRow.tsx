import { memo, useRef, type PointerEvent, type Ref } from 'react';
import { Volume2, VolumeX, X } from 'lucide-react';
import {
  archiveTabsBelow,
  closeTodayTab,
  closeTodayTabs,
  favoriteSplit,
  moveTabsToSpace,
  pinSplit,
  separateSplit,
  tabsBelow,
} from '@/app/actions';
import { Favicon } from '@/app/rows/Favicon';
import { IconSwap } from '@/app/rows/IconSwap';
import { Row } from '@/app/rows/Row';
import { Title } from '@/app/rows/Title';
import styles from '@/app/rows/rows.module.css';
import { moveToSpaceMenu } from '@/app/spaces/move-menu';
import { FAVORITES_ID, FAVORITES_LIMIT } from '@/model/types';
import type { TabInfo } from '@/platform/types';
import { useSidebar } from '@/state/sidebar';
import { activateTab, faviconFor, toggleMuted, useTabs } from '@/state/tabs';

const stop = (event: PointerEvent) => event.stopPropagation();

interface SplitRowProps {
  ids: [number, number];
  splitViewId: number;
  ref?: Ref<HTMLLIElement>;
}

/** Two tabs Chrome shows side by side: one pill holding a small pill per tab. */
export const SplitRow = memo(function SplitRow({ ids, splitViewId, ref }: SplitRowProps) {
  const [leftId, rightId] = ids;
  const left = useLastTab(leftId);
  const right = useLastTab(rightId);
  const activeId = useTabs((state) =>
    state.activeId !== null && ids.includes(state.activeId) ? state.activeId : null,
  );
  const previous = useTabs((state) => state.previousId !== null && ids.includes(state.previousId));
  const spaceId = useTabs((state) => state.tabSpaces[leftId] ?? state.spaceId);
  const spaces = useSidebar((state) => state.model.spaces);
  // A split takes two of Favorites' twelve.
  const canFavorite = useSidebar(
    (state) =>
      Object.values(state.model.items).filter((item) => item.spaceId === FAVORITES_ID).length + 2 <=
      FAVORITES_LIMIT,
  );
  // The pane under the pointer, set as the press reaches the row.
  const pressed = useRef(leftId);
  if (!left || !right) return null;

  const pane = (id: number, tab: TabInfo) => (
    <span
      className={styles.pane}
      data-pane
      data-active={activeId === id || undefined}
      onPointerDown={() => (pressed.current = id)}
    >
      <Favicon url={tab.url} loading={tab.loading && !tab.favIconUrl} />
      <Title text={tab.title} className={styles.paneTitle} />
      {(tab.audible || tab.muted) && (
        <button
          type="button"
          className={styles.accessory}
          aria-label={tab.muted ? 'Unmute tab' : 'Mute tab'}
          tabIndex={-1}
          onPointerDown={stop}
          onClick={() => toggleMuted(id)}
        >
          <IconSwap on={tab.muted} off={<Volume2 size={14} />} to={<VolumeX size={14} />} />
        </button>
      )}
      <button
        type="button"
        className={`${styles.accessory} ${styles.close}`}
        aria-label="Close tab"
        tabIndex={-1}
        onPointerDown={stop}
        onClick={() => closeTodayTab(id)}
      >
        <X size={14} />
      </button>
    </span>
  );

  return (
    <Row
      ref={ref}
      kind="split"
      id={leftId}
      selected={activeId !== null}
      previous={previous}
      onPress={() => {
        activateTab(pressed.current);
        pressed.current = leftId;
      }}
      onMiddleClick={() => closeTodayTabs(ids)}
      onOptionClick={() => separateSplit(splitViewId)}
      drag={{
        source: { kind: 'split', tabIds: ids },
        ghost: () => ({
          title: `${left.title} | ${right.title}`,
          faviconUrl: faviconFor(left.url),
          folder: false,
        }),
      }}
      // Worked out as it opens: whether any tabs are below.
      menu={() => [
        // Arc pins a split as one: it stays side by side in Pinned.
        { label: 'Pin Split', onSelect: () => pinSplit(ids) },
        ...(canFavorite
          ? [{ label: 'Add Split to Favorites', onSelect: () => favoriteSplit(ids) }]
          : []),
        { label: 'Separate All Tabs', onSelect: () => separateSplit(splitViewId) },
        ...moveToSpaceMenu(spaces, spaceId, (target) => moveTabsToSpace(ids, target)),
        'separator',
        ...(tabsBelow(ids).length
          ? [{ label: 'Archive Below', onSelect: () => archiveTabsBelow(ids) }]
          : []),
        { label: 'Close Split', onSelect: () => closeTodayTabs(ids) },
      ]}
    >
      {pane(leftId, left)}
      {pane(rightId, right)}
    </Row>
  );
});

/** The tab under its given name, if any, or its last state while the row fades out. */
function useLastTab(id: number): TabInfo | undefined {
  const live = useTabs((state) => state.tabs.get(id));
  const name = useSidebar((state) => state.session.tabTitles[id]);
  const last = useRef<TabInfo | undefined>(undefined);
  if (live) last.current = name ? { ...live, title: name } : live;
  return last.current;
}
