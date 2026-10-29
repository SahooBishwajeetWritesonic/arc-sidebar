import { ArrowLeft, ArrowRight, RotateCw, X } from 'lucide-react';
import type { MouseEvent } from 'react';
import { IconSwap } from '@/app/rows/IconSwap';
import { duplicateTab, historyStep, reloadTab, stopLoading, useTabs } from '@/state/tabs';
import styles from './nav-buttons.module.css';

/** A middle-press would start the page's autoscroll. */
const noAutoscroll = (event: MouseEvent) => event.button === 1 && event.preventDefault();

/**
 * Arc's Back, Forward and Reload. Chrome doesn't say whether a tab has history,
 * so neither arrow greys out as Arc's do.
 */
export function NavButtons() {
  const tab = useTabs((state) =>
    state.activeId === null ? undefined : state.tabs.get(state.activeId),
  );
  if (!tab) return <nav className={styles.nav} aria-label="Page navigation" />;

  const step = (by: -1 | 1) => ({
    onClick: (event: MouseEvent) => historyStep(tab.id, by, event.metaKey || event.ctrlKey),
    onAuxClick: (event: MouseEvent) => event.button === 1 && historyStep(tab.id, by, true),
    onMouseDown: noAutoscroll,
  });
  const reload = (event: MouseEvent) => {
    if (tab.loading) stopLoading(tab.id);
    else if (event.metaKey || event.ctrlKey) duplicateTab(tab.id);
    else reloadTab(tab.id);
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
        aria-label={tab.loading ? 'Stop' : 'Reload'}
        onClick={reload}
      >
        <IconSwap
          on={tab.loading}
          off={<RotateCw size={15} strokeWidth={1.75} />}
          to={<X size={16} strokeWidth={1.75} />}
        />
      </button>
    </nav>
  );
}
