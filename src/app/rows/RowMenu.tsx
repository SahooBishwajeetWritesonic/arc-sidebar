import { ContextMenu } from '@base-ui/react/context-menu';
import type { CSSProperties, ReactNode } from 'react';
import styles from './menu.module.css';

export type MenuEntry = { label: string; onSelect: () => void; danger?: boolean } | 'separator';

/** Right-click menu for a row; the row's pill is the trigger. */
export function RowMenu({
  items,
  className,
  style,
  children,
}: {
  items: MenuEntry[];
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger className={className} style={style}>
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className={styles.positioner}>
          <ContextMenu.Popup className={styles.popup}>
            {items.map((entry, i) =>
              entry === 'separator' ? (
                <ContextMenu.Separator key={i} className={styles.separator} />
              ) : (
                <ContextMenu.Item
                  key={entry.label}
                  className={styles.item}
                  data-danger={entry.danger || undefined}
                  onClick={entry.onSelect}
                >
                  {entry.label}
                </ContextMenu.Item>
              ),
            )}
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
