import { memo, useRef, type PointerEvent, type Ref } from 'react';
import { Volume2, VolumeX, X } from 'lucide-react';
import {
  archiveTabsBelow,
  closeTodayTab,
  favoriteTab,
  moveTabToSpace,
  optionClickTab,
  pinTab,
  renameTab,
  tabsBelow,
} from '@/app/actions';
import { Favicon } from '@/app/rows/Favicon';
import { RecordingBadge } from '@/app/rows/RecordingBadge';
import { IconSwap } from '@/app/rows/IconSwap';
import { InlineEdit } from '@/app/rows/InlineEdit';
import { Row } from '@/app/rows/Row';
import { Title, useDeveloperHost } from '@/app/rows/Title';
import styles from '@/app/rows/rows.module.css';
import { moveToSpaceMenu } from '@/app/spaces/move-menu';
import { FAVORITES_ID, FAVORITES_LIMIT } from '@/model/types';
import type { TabInfo } from '@/platform/types';
import { rowKey } from '@/state/selection';
import { useSidebar } from '@/state/sidebar';
import {
  activateTab,
  duplicateTab,
  faviconFor,
  moveToNewWindow,
  openInLittleArc,
  toggleMuted,
  useTabs,
} from '@/state/tabs';
import { startEditing, stopEditing, useUi } from '@/state/ui';

const stop = (event: PointerEvent) => event.stopPropagation();

export const TabRow = memo(function TabRow({ id, ref }: { id: number; ref?: Ref<HTMLLIElement> }) {
  const live = useTabs((state) => state.tabs.get(id));
  const selected = useTabs((state) => state.activeId === id);
  const previous = useTabs((state) => state.previousId === id);
  const spaceId = useTabs((state) => state.tabSpaces[id] ?? state.spaceId);
  const named = useSidebar((state) => state.session.tabTitles[id]);
  const editKey = rowKey('tab', id);
  const editing = useUi((state) => state.editingId === editKey);
  const spaces = useSidebar((state) => state.model.spaces);
  const developerHost = useDeveloperHost(live?.url ?? '');
  const canFavorite = useSidebar(
    (state) =>
      Object.values(state.model.items).filter((item) => item.spaceId === FAVORITES_ID).length <
      FAVORITES_LIMIT,
  );

  // While the row fades out after a close, the tab is already gone from the
  // store; keep drawing its last state.
  const last = useRef<{ tab: TabInfo; title: string } | undefined>(undefined);
  if (live) last.current = { tab: live, title: named ?? live.title };
  if (!last.current) return null;
  const { tab, title } = last.current;

  return (
    <Row
      ref={ref}
      kind="tab"
      id={id}
      selected={selected}
      previous={previous}
      onPress={() => activateTab(id)}
      onMiddleClick={() => closeTodayTab(id)}
      onLittleArc={() => openInLittleArc({ tabId: id })}
      onOptionClick={() => optionClickTab(id)}
      onDoubleClick={() => startEditing(editKey)}
      drag={{
        source: { kind: 'tab', tabId: id },
        ghost: () => ({ title, faviconUrl: faviconFor(tab.url), folder: false }),
      }}
      // Worked out as it opens: whether any tabs are below.
      menu={() => [
        { label: 'Rename…', onSelect: () => startEditing(editKey) },
        { label: 'Duplicate', onSelect: () => void duplicateTab(id) },
        { label: 'Pin Tab', onSelect: () => pinTab(id) },
        ...(canFavorite ? [{ label: 'Add to Favorites', onSelect: () => favoriteTab(id) }] : []),
        { label: tab.muted ? 'Unmute Tab' : 'Mute Tab', onSelect: () => toggleMuted(id) },
        ...moveToSpaceMenu(spaces, spaceId, (target) => moveTabToSpace(id, target)),
        { label: 'Move to New Window', onSelect: () => moveToNewWindow(id) },
        'separator',
        ...(tabsBelow([id]).length
          ? [{ label: 'Archive Tabs Below', onSelect: () => archiveTabsBelow([id]) }]
          : []),
        { label: 'Close Tab', onSelect: () => closeTodayTab(id) },
      ]}
    >
      <Favicon url={tab.url} loading={tab.loading && !tab.favIconUrl} />
      {editing ? (
        <InlineEdit
          initial={title}
          onCommit={(value) => {
            renameTab(id, value);
            stopEditing();
          }}
          onCancel={stopEditing}
        />
      ) : (
        <Title text={title} subtitle={developerHost} />
      )}
      <RecordingBadge tabIds={[id]} />
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
