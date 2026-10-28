import { memo, useRef, type PointerEvent, type Ref } from 'react';
import { Volume2, VolumeX, X } from 'lucide-react';
import { pinTab } from '@/app/actions';
import { Favicon } from '@/app/rows/Favicon';
import { Row } from '@/app/rows/Row';
import styles from '@/app/rows/rows.module.css';
import { activateTab, closeTab, faviconFor, toggleMuted, useTabs } from '@/state/tabs';

const stop = (event: PointerEvent) => event.stopPropagation();

export const TabRow = memo(function TabRow({ id, ref }: { id: number; ref?: Ref<HTMLLIElement> }) {
  const live = useTabs((state) => state.tabs.get(id));
  const selected = useTabs((state) => state.activeId === id);
  const previous = useTabs((state) => state.previousId === id);

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
      onMiddleClick={() => closeTab(id)}
      drag={{
        source: { kind: 'tab', tabId: id },
        ghost: () => ({ title: tab.title, faviconUrl: faviconFor(tab.url), folder: false }),
      }}
      menu={[
        { label: 'Pin Tab', onSelect: () => pinTab(id) },
        { label: tab.muted ? 'Unmute Tab' : 'Mute Tab', onSelect: () => toggleMuted(id) },
        'separator',
        { label: 'Close Tab', onSelect: () => closeTab(id) },
      ]}
    >
      <Favicon url={tab.url} loading={tab.loading && !tab.favIconUrl} />
      <span className={styles.title}>{tab.title}</span>
      {(tab.audible || tab.muted) && (
        <button
          type="button"
          className={styles.accessory}
          aria-label={tab.muted ? 'Unmute tab' : 'Mute tab'}
          tabIndex={-1}
          onPointerDown={stop}
          onClick={() => toggleMuted(id)}
        >
          {tab.muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
      )}
      <button
        type="button"
        className={`${styles.accessory} ${styles.close}`}
        aria-label="Close tab"
        tabIndex={-1}
        onPointerDown={stop}
        onClick={() => closeTab(id)}
      >
        <X size={14} />
      </button>
    </Row>
  );
});
