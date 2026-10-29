import { ContextMenu } from '@base-ui/react/context-menu';
import { Check, ChevronRight } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { useBesideMenu } from './beside';
import styles from './menu.module.css';

export type MenuEntry =
  | { label: string; onSelect: () => void; danger?: boolean; icon?: ReactNode }
  /** A setting that's on or off, ticked like a Mac menu item. */
  | { label: string; checked: boolean; onSelect: () => void }
  | { label: string; submenu: MenuEntry[] }
  | 'separator';

export function RowMenu({
  items,
  className,
  style,
  children,
}: {
  items: MenuEntry[] | (() => MenuEntry[]);
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

function MenuItems({ items }: { items: MenuEntry[] | (() => MenuEntry[]) }) {
  const entries = typeof items === 'function' ? items() : items;
  return entries.map((entry, i) => {
    if (entry === 'separator')
      return <ContextMenu.Separator key={i} className={styles.separator} />;
    if ('submenu' in entry)
      return <Submenu key={entry.label} label={entry.label} items={entry.submenu} />;
    if ('checked' in entry) {
      return (
        <ContextMenu.CheckboxItem
          key={entry.label}
          className={styles.item}
          checked={entry.checked}
          // Stays open, so several can be ticked in a row.
          onCheckedChange={() => entry.onSelect()}
        >
          <ContextMenu.CheckboxItemIndicator className={styles.check} keepMounted>
            <Check size={12} strokeWidth={2.5} />
          </ContextMenu.CheckboxItemIndicator>
          {entry.label}
        </ContextMenu.CheckboxItem>
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

function Submenu({ label, items }: { label: string; items: MenuEntry[] }) {
  const beside = useBesideMenu();
  return (
    <ContextMenu.SubmenuRoot {...beside.root}>
      <ContextMenu.SubmenuTrigger ref={beside.trigger} className={styles.item}>
        {label}
        <ChevronRight className={styles.chevron} size={12} strokeWidth={2.5} aria-hidden />
      </ContextMenu.SubmenuTrigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner
          className={styles.positioner}
          {...beside.positioner}
          alignOffset={-5}
          sideOffset={2}
        >
          <ContextMenu.Popup ref={beside.popup} className={styles.popup}>
            <MenuItems items={items} />
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.SubmenuRoot>
  );
}
