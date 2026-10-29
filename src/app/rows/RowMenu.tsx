import { ContextMenu } from '@base-ui/react/context-menu';
import { Check, ChevronRight } from 'lucide-react';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useBesideMenu } from './beside';
import styles from './menu.module.css';

export type MenuEntry =
  | {
      label: string;
      onSelect: () => void;
      danger?: boolean;
      icon?: ReactNode;
      /** Takes the item's place while Option is held, as in a Mac menu. */
      alternate?: { label: string; onSelect: () => void };
    }
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
  // Option held: as the menu opened (an Option-right-click), then as it changes.
  const [option, setOption] = useState(false);
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        className={className}
        style={style}
        onContextMenu={(event) => setOption(event.altKey)}
      >
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner className={styles.positioner}>
          <ContextMenu.Popup className={styles.popup}>
            <OptionKey onChange={setOption} />
            <MenuItems items={items} option={option} />
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function OptionKey({ onChange }: { onChange: (held: boolean) => void }) {
  useEffect(() => {
    const follow = (event: KeyboardEvent | PointerEvent) => onChange(event.altKey);
    const types = ['keydown', 'keyup', 'pointermove', 'pointerdown'] as const;
    for (const type of types) window.addEventListener(type, follow, true);
    return () => {
      for (const type of types) window.removeEventListener(type, follow, true);
    };
  }, [onChange]);
  return null;
}

function MenuItems({
  items,
  option,
}: {
  items: MenuEntry[] | (() => MenuEntry[]);
  option: boolean;
}) {
  const entries = typeof items === 'function' ? items() : items;
  return entries.map((entry, i) => {
    if (entry === 'separator')
      return <ContextMenu.Separator key={i} className={styles.separator} />;
    if ('submenu' in entry)
      return (
        <Submenu key={entry.label} label={entry.label} items={entry.submenu} option={option} />
      );
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
    const { alternate } = entry;
    return (
      <ContextMenu.Item
        key={entry.label}
        className={styles.item}
        data-danger={entry.danger || undefined}
        onClick={option && alternate ? alternate.onSelect : entry.onSelect}
      >
        {entry.icon && <span className={styles.icon}>{entry.icon}</span>}
        {alternate ? (
          // Both take the same room, so the menu keeps its width as they swap.
          <span className={styles.alternates}>
            <span data-shown={!option || undefined}>{entry.label}</span>
            <span data-shown={option || undefined}>{alternate.label}</span>
          </span>
        ) : (
          entry.label
        )}
      </ContextMenu.Item>
    );
  });
}

function Submenu({ label, items, option }: { label: string; items: MenuEntry[]; option: boolean }) {
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
            <MenuItems items={items} option={option} />
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.SubmenuRoot>
  );
}
