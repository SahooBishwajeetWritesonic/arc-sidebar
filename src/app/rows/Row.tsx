import { motion } from 'motion/react';
import type { CSSProperties, MouseEvent, PointerEvent, ReactNode, Ref } from 'react';
import { dropOn } from '@/app/actions';
import { beginPress, useDrag, type Ghost } from '@/app/drag/drag';
import type { DragSource } from '@/app/drag/targets';
import { fade, spring } from '@/app/motion';
import { RowMenu, type MenuEntry } from './RowMenu';
import styles from './rows.module.css';

export type RowKind = 'tab' | 'pin' | 'folder';

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
  const dropInto = useDrag(
    (state) => state.target?.section === 'pinned' && state.target.into === String(id),
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
      ref={ref}
      layout="position"
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
