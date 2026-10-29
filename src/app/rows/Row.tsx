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
import { beginPress, useDrag, type Ghost } from '@/app/drag/drag';
import type { DragSource } from '@/app/drag/targets';
import { fade, spring } from '@/app/motion';
import { LayoutKey } from './layout-key';
import { RowMenu, type MenuEntry } from './RowMenu';
import styles from './rows.module.css';

export type RowKind = 'tab' | 'split' | 'pin' | 'folder';

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

  const onPointerDown = (event: PointerEvent<HTMLLIElement>) => {
    if (event.button !== 0) return;
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
      data-previous={(previous && !selected) || undefined}
      data-drop-into={dropInto || undefined}
      data-split-drop={splitSide}
      role="option"
      aria-selected={!!selected}
      tabIndex={selected ? 0 : -1}
      onPointerDown={onPointerDown}
      onMouseDown={(event: MouseEvent) => event.button === 1 && event.preventDefault()}
      onAuxClick={(event: MouseEvent) => event.button === 1 && onMiddleClick?.()}
      onDoubleClick={onDoubleClick}
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
