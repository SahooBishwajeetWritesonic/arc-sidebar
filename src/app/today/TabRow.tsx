import { memo, useRef, type PointerEvent, type Ref } from 'react';
import { Volume2, VolumeX, X } from 'lucide-react';
import { closeTodayTab, favoriteTab, moveTabToSpace, pinTab } from '@/app/actions';
import { Favicon } from '@/app/rows/Favicon';
import { IconSwap } from '@/app/rows/IconSwap';
import { Row } from '@/app/rows/Row';
import { Title, useDeveloperHost } from '@/app/rows/Title';
import styles from '@/app/rows/rows.module.css';
import { moveToSpaceMenu } from '@/app/spaces/move-menu';
import { FAVORITES_ID, FAVORITES_LIMIT } from '@/model/types';
import { useSidebar } from '@/state/sidebar';
import { activateTab, faviconFor, toggleMuted, useTabs } from '@/state/tabs';

const stop = (event: PointerEvent) => event.stopPropagation();

export const TabRow = memo(function TabRow({ id, ref }: { id: number; ref?: Ref<HTMLLIElement> }) {
  const live = useTabs((state) => state.tabs.get(id));
  const selected = useTabs((state) => state.activeId === id);
  const previous = useTabs((state) => state.previousId === id);
  const spaceId = useTabs((state) => state.tabSpaces[id] ?? state.spaceId);
  const spaces = useSidebar((state) => state.model.spaces);
  const developerHost = useDeveloperHost(live?.url ?? '');
  const canFavorite = useSidebar(
    (state) =>
      Object.values(state.model.items).filter((item) => item.spaceId === FAVORITES_ID).length <
      FAVORITES_LIMIT,
  );

  // While the row fades out after a close, the tab is already gone from the
  // store; keep drawing its last state.
  const last = useRef(live);
  if (live) last.current = live;
  const tab = live ?? last.current;
  if (!tab) return null;

  return (
    <Row
      ref={ref}
      kind="tab"
      id={id}
      selected={selected}
      previous={previous}
      onPress={() => activateTab(id)}
      onMiddleClick={() => closeTodayTab(id)}
      drag={{
        source: { kind: 'tab', tabId: id },
        ghost: () => ({ title: tab.title, faviconUrl: faviconFor(tab.url), folder: false }),
      }}
      menu={[
        { label: 'Pin Tab', onSelect: () => pinTab(id) },
        ...(canFavorite ? [{ label: 'Add to Favorites', onSelect: () => favoriteTab(id) }] : []),
        { label: tab.muted ? 'Unmute Tab' : 'Mute Tab', onSelect: () => toggleMuted(id) },
        ...moveToSpaceMenu(spaces, spaceId, (target) => moveTabToSpace(id, target)),
        'separator',
        { label: 'Close Tab', onSelect: () => closeTodayTab(id) },
      ]}
    >
      <Favicon url={tab.url} loading={tab.loading && !tab.favIconUrl} />
      <Title text={tab.title} subtitle={developerHost} />
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
    </Row>
  );
});
