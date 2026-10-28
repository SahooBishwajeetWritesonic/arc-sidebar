import { Menu } from '@base-ui/react/menu';
import { Archive, Check, Ellipsis } from 'lucide-react';
import { exportSidebar, setArchiveAfter } from '@/app/actions';
import menu from '@/app/rows/menu.module.css';
import type { ArchiveAfter } from '@/model/types';
import { useSidebar } from '@/state/sidebar';
import { showView, useUi } from '@/state/ui';
import styles from './bottom-bar.module.css';

const ARCHIVE_CHOICES: { value: ArchiveAfter; label: string }[] = [
  { value: '12h', label: '12 Hours' },
  { value: '24h', label: '24 Hours' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
];

/** Arc's bottom bar: Library (here, the Archive) on the left, more on the right. */
export function BottomBar() {
  const view = useUi((state) => state.view);
  const archiveAfter = useSidebar((state) => state.model.settings?.archiveAfter ?? '12h');

  return (
    <footer className={styles.bar}>
      <button
        type="button"
        className={styles.button}
        aria-label="Archive"
        aria-pressed={view === 'archive'}
        title="Archive"
        onClick={() => showView(view === 'archive' ? 'sidebar' : 'archive')}
      >
        <Archive size={16} strokeWidth={1.75} />
      </button>

      <Menu.Root>
        <Menu.Trigger className={styles.button} aria-label="More">
          <Ellipsis size={16} strokeWidth={1.75} />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner className={menu.positioner} side="top" align="end" sideOffset={6}>
            <Menu.Popup className={menu.popup}>
              <Menu.RadioGroup
                value={archiveAfter}
                onValueChange={(value) => setArchiveAfter(value as ArchiveAfter)}
              >
                <Menu.GroupLabel className={menu.label}>Archive Today tabs after</Menu.GroupLabel>
                {ARCHIVE_CHOICES.map((choice) => (
                  <Menu.RadioItem
                    key={choice.value}
                    value={choice.value}
                    className={menu.item}
                    closeOnClick
                  >
                    <Menu.RadioItemIndicator className={menu.check} keepMounted>
                      <Check size={12} strokeWidth={2.5} />
                    </Menu.RadioItemIndicator>
                    {choice.label}
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
              <Menu.Separator className={menu.separator} />
              <Menu.Item className={menu.item} onClick={exportSidebar}>
                <span className={menu.check} />
                Export Sidebar…
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </footer>
  );
}
