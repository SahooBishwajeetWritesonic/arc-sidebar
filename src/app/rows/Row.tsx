import { motion, useIsPresent } from 'motion/react';
import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import { dropOn } from '@/app/actions';
import { beginPress, isPress, useDrag, type Ghost } from '@/app/drag/drag';
import type { DragSource } from '@/app/drag/targets';
import { fade, spring } from '@/app/motion';
import { selectFrom } from '@/app/selection/actions';
import { clearSelection, isSelectable, rowKey, useSelection } from '@/state/selection';
import { LayoutKey } from './layout-key';
import { RowMenu, type MenuEntry } from './RowMenu';
import styles from './rows.module.css';

/** 'link': a row that opens a page, such as a Live Folder's sign-in. */
export type RowKind = 'tab' | 'split' | 'pin' | 'folder' | 'link';

interface RowProps {
  kind: RowKind;
  id: string | number;
  selected?: boolean;
  previous?: boolean;
  depth?: number;
  parentId?: string | null;
  /** Folders: expanded. */
  open?: boolean;
  /** Pointer-down. Arc selects tabs on press, not on release. */
  onPress?: () => void;
  /** Released without dragging. For actions a drag mustn't trigger. */
  onTap?: () => void;
  onMiddleClick?: () => void;
  onDoubleClick?: () => void;
  drag?: { source: DragSource; ghost: () => Omit<Ghost, 'width'> };
  menu?: MenuEntry[];
  children: ReactNode;
  ref?: Ref<HTMLLIElement>;
}

/** Fades in, fades out in place while the rows below slide over it, and slides when moved. */
export function Row({
  kind,
  id,
  selected,
  previous,
  depth = 0,
  parentId = null,
  open,
  onPress,
  onTap,
  onMiddleClick,
  onDoubleClick,
  drag,
  menu,
  children,
  ref,
}: RowProps) {
  const rowRef = useFocusHandoff(ref);
  const layoutKey = useContext(LayoutKey);
  const dropInto = useDrag(
    (state) => state.target?.section === 'pinned' && state.target.into === String(id),
  );
  // Which half lights up when a tab dropped here would split it.
  const splitSide = useDrag((state) =>
    kind === 'tab' && state.target?.section === 'split' && state.target.withTabId === id
      ? state.target.side
      : undefined,
  );
  const plateStyle = { '--depth': depth } as CSSProperties;
  const key = rowKey(kind, id);
  const selectable = isSelectable(kind);
  // 0: not selected; 1: the only one; 2: one of several, which act together.
  const marked = useSelection((state) =>
    !state.keys.includes(key) ? 0 : state.keys.length > 1 ? 2 : 1,
  );
  // The last tab's tint would read as one more selected row.
  const selecting = useSelection((state) => state.keys.length > 0);

  const onPointerDown = (event: PointerEvent<HTMLLIElement>) => {
    if (fromMenu(event)) return;
    // A right- or middle-click outside the selection is about that row alone.
    if (!isPress(event)) {
      if (marked !== 2) clearSelection();
      return;
    }
    // ⌘-click adds or drops the row, ⇧-click takes the rows between; neither opens it.
    if (selectable && (event.metaKey || event.shiftKey)) {
      // No text selection; the row takes focus itself, so Escape and Delete work on the selection.
      event.preventDefault();
      event.currentTarget.focus({ preventScroll: true });
      selectFrom(event.currentTarget, key, event.shiftKey);
      return;
    }
    clearSelection();
    onPress?.();
    if (drag) beginPress(event, { ...drag, onTap, onDrop: dropOn });
    else onTap?.();
  };

  return (
    <motion.li
      ref={rowRef}
      layout="position"
      layoutDependency={layoutKey}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: fade }}
      transition={{ opacity: fade, layout: spring.row }}
      className={styles.row}
      data-nav-row={kind}
      data-row-id={id}
      data-depth={depth}
      data-parent-id={parentId ?? ''}
      data-open={open || undefined}
      data-selected={selected || undefined}
      data-multi-selected={marked > 0 || undefined}
      data-previous={(previous && !selected && !selecting) || undefined}
      data-drop-into={dropInto || undefined}
      data-split-drop={splitSide}
      role="option"
      aria-selected={!!selected || marked > 0}
      tabIndex={selected ? 0 : -1}
      onPointerDown={onPointerDown}
      onMouseDown={(event: MouseEvent) => event.button === 1 && event.preventDefault()}
      onAuxClick={(event: MouseEvent) =>
        event.button === 1 && !fromMenu(event) && onMiddleClick?.()
      }
      onDoubleClick={(event: MouseEvent) => !fromMenu(event) && onDoubleClick?.()}
    >
      {menu ? (
        <RowMenu items={menu} className={styles.plate} style={plateStyle}>
          {children}
        </RowMenu>
      ) : (
        <div className={styles.plate} style={plateStyle}>
          {children}
        </div>
      )}
    </motion.li>
  );
}

/**
 * React passes events from the row's menu up to the row, though the menu is
 * drawn elsewhere on the page: a click on a menu item mustn't press the row.
 */
const fromMenu = (event: MouseEvent | PointerEvent) =>
  !event.currentTarget.contains(event.target as Node);

/**
 * A row that leaves while it, its menu or its rename field has focus hands focus to the
 * nearest row that stays, so the keyboard isn't left on nothing.
 */
function useFocusHandoff(ref: Ref<HTMLLIElement> | undefined) {
  const row = useRef<HTMLLIElement | null>(null);
  const isPresent = useIsPresent();

  useEffect(() => {
    const element = row.current;
    if (isPresent || !element) return;
    element.dataset.leaving = '';
    const menuOpen = element.querySelector('[data-popup-open]') !== null;
    if (!menuOpen && !element.contains(document.activeElement)) return;
    const page = element.closest('[data-active-page]') ?? document;
    const rows = [...page.querySelectorAll<HTMLElement>('[data-nav-row]')];
    const at = rows.indexOf(element);
    const nearest = [...rows.slice(at + 1), ...rows.slice(0, at).reverse()].find(
      (other) => other.dataset.leaving === undefined,
    );
    nearest?.focus({ preventScroll: true });
  }, [isPresent]);

  return useCallback(
    (element: HTMLLIElement | null) => {
      row.current = element;
      if (typeof ref === 'function') ref(element);
      else if (ref) ref.current = element;
    },
    [ref],
  );
}
