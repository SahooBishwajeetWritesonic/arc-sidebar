import { ArrowLeft, ArrowRight, RotateCw, X } from 'lucide-react';
import { useEffect, useState, type MouseEvent } from 'react';
import { IconSwap } from '@/app/rows/IconSwap';
import { duplicateTab, historyStep, reloadTab, stopLoading, useTabs } from '@/state/tabs';
import styles from './nav-buttons.module.css';

/** A middle-press would start the page's autoscroll. */
const noAutoscroll = (event: MouseEvent) => event.button === 1 && event.preventDefault();

/** Stop shows from the press at least this long, so a quick reload still reads. */
const STOP_HOLD_MS = 500;

/**
 * Arc's Back, Forward and Reload. Chrome doesn't say whether a tab has history,
 * so neither arrow greys out as Arc's do.
 */
export function NavButtons() {
  const tab = useTabs((state) =>
    state.activeId === null ? undefined : state.tabs.get(state.activeId),
  );
  const [pressed, setPressed] = useState<number | null>(null);
  useEffect(() => {
    if (pressed === null) return;
    const timer = setTimeout(() => setPressed(null), STOP_HOLD_MS);
    return () => clearTimeout(timer);
  }, [pressed]);
  if (!tab) return <nav className={styles.nav} aria-label="Page navigation" />;

  const step = (by: -1 | 1) => ({
    onClick: (event: MouseEvent) => historyStep(tab.id, by, event.metaKey || event.ctrlKey),
    onAuxClick: (event: MouseEvent) => event.button === 1 && historyStep(tab.id, by, true),
    onMouseDown: noAutoscroll,
  });
  const stopping = tab.loading || pressed === tab.id;
  const onReload = (event: MouseEvent) => {
    if (stopping) {
      setPressed(null);
      stopLoading(tab.id);
    } else if (event.metaKey || event.ctrlKey) duplicateTab(tab.id);
    else {
      setPressed(tab.id);
      reloadTab(tab.id);
    }
  };

  return (
    <nav className={styles.nav} aria-label="Page navigation">
      <button
        type="button"
        className={styles.button}
        data-nudge="back"
        aria-label="Back"
        {...step(-1)}
      >
        <ArrowLeft size={16} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className={styles.button}
        data-nudge="forward"
        aria-label="Forward"
        {...step(1)}
      >
        <ArrowRight size={16} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className={styles.button}
        data-nudge={stopping ? undefined : 'reload'}
        aria-label={stopping ? 'Stop' : 'Reload'}
        onClick={onReload}
      >
        <IconSwap
          on={stopping}
          off={<RotateCw size={15} strokeWidth={1.75} />}
          to={<X size={16} strokeWidth={1.75} />}
        />
      </button>
    </nav>
  );
}
