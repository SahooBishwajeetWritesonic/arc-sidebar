import { ContextMenu } from '@base-ui/react/context-menu';
import { ChevronRight } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import styles from './menu.module.css';

export type MenuEntry =
  | { label: string; onSelect: () => void; danger?: boolean; icon?: ReactNode }
  | { label: string; submenu: MenuEntry[] }
  | 'separator';

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
            <MenuItems items={items} />
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function MenuItems({ items }: { items: MenuEntry[] }) {
  return items.map((entry, i) => {
    if (entry === 'separator')
      return <ContextMenu.Separator key={i} className={styles.separator} />;
    if ('submenu' in entry) {
      return (
        <ContextMenu.SubmenuRoot key={entry.label}>
          <ContextMenu.SubmenuTrigger className={styles.item}>
            {entry.label}
            <ChevronRight className={styles.chevron} size={12} strokeWidth={2.5} aria-hidden />
          </ContextMenu.SubmenuTrigger>
          <ContextMenu.Portal>
            <ContextMenu.Positioner className={styles.positioner} alignOffset={-5} sideOffset={2}>
              <ContextMenu.Popup className={styles.popup}>
                <MenuItems items={entry.submenu} />
              </ContextMenu.Popup>
            </ContextMenu.Positioner>
          </ContextMenu.Portal>
        </ContextMenu.SubmenuRoot>
      );
    }
    return (
      <ContextMenu.Item
        key={entry.label}
        className={styles.item}
        data-danger={entry.danger || undefined}
        onClick={entry.onSelect}
      >
        {entry.icon && <span className={styles.icon}>{entry.icon}</span>}
        {entry.label}
      </ContextMenu.Item>
    );
  });
}
