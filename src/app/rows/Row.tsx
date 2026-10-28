import { motion } from 'motion/react';
import type { CSSProperties, MouseEvent, PointerEvent, ReactNode, Ref } from 'react';
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
  /** Primary press. Arc acts on pointer-down, not on release. */
  onPress?: () => void;
  onMiddleClick?: () => void;
  onDoubleClick?: () => void;
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
  onPress,
  onMiddleClick,
  onDoubleClick,
  menu,
  children,
  ref,
}: RowProps) {
  const plateStyle = { '--depth': depth } as CSSProperties;

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
      data-selected={selected || undefined}
      data-previous={(previous && !selected) || undefined}
      role="option"
      aria-selected={!!selected}
      tabIndex={selected ? 0 : -1}
      onPointerDown={(event: PointerEvent) => event.button === 0 && onPress?.()}
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
