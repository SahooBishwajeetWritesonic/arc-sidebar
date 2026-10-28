import { motion } from 'motion/react';
import { memo, useRef, type MouseEvent, type PointerEvent, type Ref } from 'react';
import { Volume2, VolumeX, X } from 'lucide-react';
import { fade, spring } from '@/app/motion';
import { activateTab, closeTab, toggleMuted, useTabs } from '@/state/tabs';
import { Favicon } from './Favicon';
import styles from './today.module.css';

interface TabRowProps {
  id: number;
  index: number;
  /** Overrides the roving tabindex when no row is selected. */
  focusable?: boolean;
  ref?: Ref<HTMLLIElement>;
}

const stop = (event: PointerEvent) => event.stopPropagation();

export const TabRow = memo(function TabRow({ id, index, focusable, ref }: TabRowProps) {
  const live = useTabs((state) => state.tabs.get(id));
  const selected = useTabs((state) => state.activeId === id);
  const previous = useTabs((state) => state.previousId === id);

  // While the row fades out after a close, the tab is already gone from the
  // store; keep drawing its last state.
  const last = useRef(live);
  if (live) last.current = live;
  const tab = live ?? last.current;
  if (!tab) return null;

  const onPointerDown = (event: PointerEvent) => {
    // Arc selects on press, not on release.
    if (event.button === 0) activateTab(id);
  };
  const onMouseDown = (event: MouseEvent) => {
    if (event.button === 1) event.preventDefault(); // no autoscroll on middle-click
  };
  const onAuxClick = (event: MouseEvent) => {
    if (event.button === 1) closeTab(id);
  };

  return (
    <motion.li
      ref={ref}
      layout="position"
      layoutDependency={index}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: fade }}
      transition={{ opacity: fade, layout: spring.row }}
      className={styles.row}
      data-tab-id={id}
      data-selected={selected || undefined}
      data-previous={(previous && !selected) || undefined}
      role="option"
      aria-selected={selected}
      tabIndex={(focusable ?? selected) ? 0 : -1}
      onPointerDown={onPointerDown}
      onMouseDown={onMouseDown}
      onAuxClick={onAuxClick}
    >
      <div className={styles.plate}>
        <Favicon tab={tab} />
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
      </div>
    </motion.li>
  );
});
