import { Menu } from '@base-ui/react/menu';
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Eraser,
  RefreshCw,
  RotateCw,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type MouseEvent } from 'react';
import { IconSwap } from '@/app/rows/IconSwap';
import menu from '@/app/rows/menu.module.css';
import type { ReloadKind } from '@/platform/types';
import { duplicateTab, historyStep, reloadTab, stopLoading, useTabs } from '@/state/tabs';
import styles from './nav-buttons.module.css';

/** A middle-press would start the page's autoscroll. */
const noAutoscroll = (event: MouseEvent) => event.button === 1 && event.preventDefault();

/** Stop shows from the press at least this long, so a quick reload still reads. */
const STOP_HOLD_MS = 500;

const RELOADS: { how: ReloadKind; label: string; keys?: string; Icon: LucideIcon }[] = [
  { how: 'normal', label: 'Reload', keys: '⌘R', Icon: RotateCw },
  { how: 'hard', label: 'Hard Reload', keys: '⇧⌘R', Icon: RefreshCw },
  { how: 'clear', label: 'Clear Site Cache and Reload', Icon: Eraser },
];

/**
 * Arc's Back, Forward and Reload, with Chrome's reload menu. Chrome doesn't say whether
 * a tab has history, so neither arrow greys out as Arc's do.
 */
export function NavButtons() {
  const tab = useTabs((state) =>
    state.activeId === null ? undefined : state.tabs.get(state.activeId),
  );
  const [pressed, setPressed] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const shift = useShiftOver();
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
  const reload = (how: ReloadKind) => {
    setPressed(tab.id);
    reloadTab(tab.id, how);
  };
  const onReload = (event: MouseEvent) => {
    if (stopping) {
      setPressed(null);
      stopLoading(tab.id);
    } else if (event.metaKey || event.ctrlKey) duplicateTab(tab.id);
    else reload(event.shiftKey ? 'hard' : 'normal');
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
      <div className={styles.reload} {...shift.watch}>
        <button
          type="button"
          className={styles.button}
          data-nudge={stopping ? undefined : 'reload'}
          aria-label={stopping ? 'Stop' : shift.held ? 'Hard Reload' : 'Reload'}
          onClick={onReload}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenuOpen(true);
          }}
        >
          <IconSwap
            on={stopping}
            off={
              <IconSwap
                on={shift.held}
                off={<RotateCw size={15} strokeWidth={1.75} />}
                to={<RefreshCw size={15} strokeWidth={1.75} />}
              />
            }
            to={<X size={16} strokeWidth={1.75} />}
          />
        </button>
        <Menu.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Menu.Trigger className={styles.more} aria-label="Reload Options">
            <ChevronDown size={12} strokeWidth={2} />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner className={menu.positioner} side="bottom" align="end" sideOffset={4}>
              <Menu.Popup className={menu.popup}>
                {RELOADS.map(({ how, label, keys, Icon }) => (
                  <Menu.Item key={how} className={menu.item} onClick={() => reload(how)}>
                    <span className={menu.icon}>
                      <Icon size={14} strokeWidth={1.75} />
                    </span>
                    {label}
                    {keys && <span className={menu.keys}>{keys}</span>}
                  </Menu.Item>
                ))}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
    </nav>
  );
}

/** Shift held over Reload makes it Hard Reload, as in Chrome. */
function useShiftOver() {
  const [over, setOver] = useState(false);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!over) return;
    const follow = (event: KeyboardEvent) => setHeld(event.shiftKey);
    window.addEventListener('keydown', follow);
    window.addEventListener('keyup', follow);
    return () => {
      window.removeEventListener('keydown', follow);
      window.removeEventListener('keyup', follow);
    };
  }, [over]);
  return {
    held: over && held,
    watch: {
      onPointerMove: (event: { shiftKey: boolean }) => {
        setOver(true);
        setHeld(event.shiftKey);
      },
      onPointerLeave: () => setOver(false),
    },
  };
}
