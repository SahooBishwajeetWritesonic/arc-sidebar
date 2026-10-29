import { AnimatePresence, motion } from 'motion/react';
import { Pause, Play, SkipBack, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import { useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { fade, spring } from '@/app/motion';
import { Favicon } from '@/app/rows/Favicon';
import { IconSwap } from '@/app/rows/IconSwap';
import { dismissPlayer, playPause, skip, useMedia } from '@/state/media';
import { activateTab, toggleMuted, useTabs } from '@/state/tabs';
import styles from './media.module.css';

/** At most this many players stack above the bottom bar. */
const SHOWN = 3;

/**
 * Arc's mini players: leave a tab that's playing sound and a small player for it sits
 * above the bottom bar until it closes or is dismissed.
 */
export function MediaTray() {
  const players = useMedia((state) => state.players);
  const activeId = useTabs((state) => state.activeId);
  const shown = players.filter((id) => id !== activeId).slice(0, SHOWN);
  if (!shown.length) return null;
  return (
    <section className={styles.tray} aria-label="Playing">
      <AnimatePresence initial={false} mode="popLayout">
        {shown.map((id) => (
          <Player key={id} tabId={id} />
        ))}
      </AnimatePresence>
    </section>
  );
}

function Player({ tabId }: { tabId: number }) {
  const tab = useTabs((state) => state.tabs.get(tabId));
  const media = useMedia((state) => state.states[tabId]);
  if (!tab) return null;
  // As the page last said, or as Chrome hears it until the page answers.
  const playing = media?.playing ?? tab.audible;
  const title = media?.title ?? tab.title;
  const can = (action: string) => media?.actions.includes(action) ?? false;

  return (
    <motion.div
      layout="position"
      className={styles.player}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: fade }}
      transition={{ opacity: fade, y: spring.row, layout: spring.row }}
    >
      <button
        type="button"
        className={styles.source}
        title={media?.artist ? `${title} · ${media.artist}` : title}
        onClick={() => activateTab(tabId)}
      >
        <Favicon url={tab.url} />
        <Marquee text={title} />
      </button>
      {can('previoustrack') && (
        <Control label="Previous track" onClick={() => skip(tabId, 'previoustrack')}>
          <SkipBack size={13} fill="currentColor" />
        </Control>
      )}
      <Control label={playing ? 'Pause' : 'Play'} onClick={() => playPause(tabId)}>
        <IconSwap
          on={playing}
          off={<Play size={14} fill="currentColor" />}
          to={<Pause size={14} fill="currentColor" />}
        />
      </Control>
      {can('nexttrack') && (
        <Control label="Next track" onClick={() => skip(tabId, 'nexttrack')}>
          <SkipForward size={13} fill="currentColor" />
        </Control>
      )}
      <Control label={tab.muted ? 'Unmute' : 'Mute'} onClick={() => toggleMuted(tabId)}>
        <IconSwap on={tab.muted} off={<Volume2 size={14} />} to={<VolumeX size={14} />} />
      </Control>
      <Control label="Close player" className={styles.close} onClick={() => dismissPlayer(tabId)}>
        <X size={14} />
      </Control>
    </motion.div>
  );
}

function Control({
  label,
  className = '',
  onClick,
  children,
}: {
  label: string;
  className?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`${styles.control} ${className}`}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** A long title scrolls to its end and back while the pointer is on it, as Arc's does. */
function Marquee({ text }: { text: string }) {
  const [shift, setShift] = useState(0);
  const measure = (event: PointerEvent<HTMLSpanElement>) => {
    const box = event.currentTarget;
    const inner = box.firstElementChild as HTMLElement;
    setShift(Math.max(0, inner.scrollWidth - box.clientWidth));
  };
  const style = {
    '--marquee-shift': `${-shift}px`,
    // About 30 px a second, never rushed.
    '--marquee-time': `${Math.max(2, shift / 30)}s`,
  } as CSSProperties;
  return (
    <span
      className={styles.marquee}
      data-scrolls={shift > 0 || undefined}
      style={style}
      dir="auto"
      onPointerEnter={measure}
      onPointerLeave={() => setShift(0)}
    >
      <span className={styles.text}>{text}</span>
    </span>
  );
}
