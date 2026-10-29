import { Menu } from '@base-ui/react/menu';
import { Archive, Check, ChevronRight, Plus } from 'lucide-react';
import {
  createSpace,
  exportSidebar,
  newFolder,
  newLiveFolder,
  setArchiveAfter,
  setNavButtons,
  switchSpace,
} from '@/app/actions';
import { useBesideMenu } from '@/app/rows/beside';
import menu from '@/app/rows/menu.module.css';
import { SpaceGlyph } from '@/app/spaces/icons';
import spaces from '@/app/spaces/spaces.module.css';
import { githubFolderOf } from '@/model/live';
import type { ArchiveAfter } from '@/model/types';
import { loadBackups, useSidebar } from '@/state/sidebar';
import { setImporting, setRestoring, showView, useUi } from '@/state/ui';
import styles from './bottom-bar.module.css';

const ARCHIVE_CHOICES: { value: ArchiveAfter; label: string }[] = [
  { value: '12h', label: '12 Hours' },
  { value: '24h', label: '24 Hours' },
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
];

/** Arc's bottom bar: Library (here, the Archive), the spaces, and "+". */
export function BottomBar() {
  const view = useUi((state) => state.view);

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
      <SpaceSwitcher />
      <AddMenu />
    </footer>
  );
}

function SpaceSwitcher() {
  const all = useSidebar((state) => state.model.spaces);
  const current = useSidebar((state) => state.spaceId);
  if (all.length < 2) return <div className={spaces.switcher} />;
  return (
    <nav className={spaces.switcher} aria-label="Spaces">
      {all.map((space, i) => (
        <button
          key={space.id}
          type="button"
          className={spaces.space}
          aria-label={space.name}
          aria-current={space.id === current}
          title={i < 9 ? `${space.name} (⌃${i + 1})` : space.name}
          onClick={() => {
            showView('sidebar');
            switchSpace(space.id);
          }}
        >
          <SpaceGlyph icon={space.icon} />
        </button>
      ))}
    </nav>
  );
}

function AddMenu() {
  const archiveAfter = useSidebar((state) => state.model.settings?.archiveAfter ?? '12h');
  const hasLiveFolder = useSidebar((state) => githubFolderOf(state.model) !== undefined);
  const navButtons = useSidebar((state) => state.model.settings.navButtons);
  const beside = useBesideMenu();
  return (
    <Menu.Root>
      <Menu.Trigger className={styles.button} aria-label="More">
        <Plus size={16} strokeWidth={1.75} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className={menu.positioner} side="top" align="end" sideOffset={6}>
          <Menu.Popup className={menu.popup}>
            <Menu.Item className={menu.item} onClick={() => createSpace()}>
              New Space
            </Menu.Item>
            <Menu.Item className={menu.item} onClick={() => newFolder()}>
              New Folder
            </Menu.Item>
            {!hasLiveFolder && (
              <Menu.Item className={menu.item} onClick={newLiveFolder}>
                New GitHub Live Folder
              </Menu.Item>
            )}
            <Menu.Separator className={menu.separator} />
            <Menu.SubmenuRoot {...beside.root}>
              <Menu.SubmenuTrigger ref={beside.trigger} className={menu.item}>
                Archive Today Tabs After
                <ChevronRight className={menu.chevron} size={12} strokeWidth={2.5} aria-hidden />
              </Menu.SubmenuTrigger>
              <Menu.Portal>
                <Menu.Positioner
                  className={menu.positioner}
                  {...beside.positioner}
                  alignOffset={-5}
                  sideOffset={2}
                >
                  <Menu.Popup ref={beside.popup} className={menu.popup}>
                    <Menu.RadioGroup
                      value={archiveAfter}
                      onValueChange={(value) => setArchiveAfter(value as ArchiveAfter)}
                    >
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
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.SubmenuRoot>
            <Menu.Item className={menu.item} onClick={() => setNavButtons(!navButtons)}>
              {navButtons ? 'Hide' : 'Show'} Back, Forward and Reload
            </Menu.Item>
            <Menu.Separator className={menu.separator} />
            <Menu.Item className={menu.item} onClick={() => setImporting(true)}>
              Import from Arc…
            </Menu.Item>
            <Menu.Item className={menu.item} onClick={exportSidebar}>
              Export Sidebar…
            </Menu.Item>
            <Menu.Item className={menu.item} onClick={() => void loadBackups().then(setRestoring)}>
              Restore Sidebar…
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
