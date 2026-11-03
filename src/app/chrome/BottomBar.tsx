import { Menu } from '@base-ui/react/menu';
import { Archive, Check, ChevronRight, Plus } from 'lucide-react';
import { Reorder } from 'motion/react';
import { useRef, useState, type KeyboardEvent } from 'react';
import {
  createSpace,
  exportSidebar,
  moveSpace,
  newFolder,
  newLiveFolder,
  setArchiveAfter,
  setNavButtons,
  setNumbering,
  setSync,
  switchSpace,
} from '@/app/actions';
import { useDrag } from '@/app/drag/drag';
import { spring } from '@/app/motion';
import { useBesideMenu } from '@/app/rows/beside';
import menu from '@/app/rows/menu.module.css';
import { SpaceGlyph } from '@/app/spaces/icons';
import spaces from '@/app/spaces/spaces.module.css';
import { githubFolderOf } from '@/model/live';
import type { ArchiveAfter } from '@/model/types';
import { loadBackups, loadSyncProblem, useSidebar } from '@/state/sidebar';
import {
  openLibrary,
  setEditingRoutes,
  setImporting,
  setRestoring,
  showView,
  useUi,
} from '@/state/ui';
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
        onClick={() => (view === 'archive' ? showView('sidebar') : openLibrary('archive'))}
      >
        <Archive size={16} strokeWidth={1.75} />
      </button>
      <SpaceSwitcher />
      <AddMenu />
    </footer>
  );
}

/** Dragging an icon sideways reorders spaces, as Arc on Windows does; so does ⌥←/→ on one. */
function SpaceSwitcher() {
  const all = useSidebar((state) => state.model.spaces);
  const current = useSidebar((state) => state.spaceId);
  // The order while an icon is dragged; saved when it's let go.
  const [dragged, setDragged] = useState<string[] | null>(null);
  const latest = useRef<string[] | null>(null);
  latest.current = dragged;
  // A drag ends with a click on the icon dragged, which mustn't switch to it.
  const justDragged = useRef(false);
  const nav = useRef<HTMLElement>(null);
  const dropTarget = useDrag((state) =>
    state.target?.section === 'space' ? state.target.spaceId : null,
  );
  const landed = useDrag((state) => state.landed);
  if (all.length < 2) return <div className={spaces.switcher} />;

  const order = dragged ?? all.map((space) => space.id);
  const drop = (spaceId: string) => {
    const index = latest.current?.indexOf(spaceId) ?? -1;
    if (index !== -1 && all[index]?.id !== spaceId) moveSpace(spaceId, index);
    setDragged(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, spaceId: string, i: number) => {
    if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    event.stopPropagation();
    const to = i + (event.key === 'ArrowLeft' ? -1 : 1);
    if (to < 0 || to >= all.length) return;
    moveSpace(spaceId, to);
    // React moves the button, which drops its focus; put it back.
    const button = event.currentTarget;
    requestAnimationFrame(() => button.focus());
  };

  return (
    <Reorder.Group
      as="nav"
      ref={nav}
      axis="x"
      values={order}
      onReorder={setDragged}
      className={spaces.switcher}
      aria-label="Spaces"
    >
      {order.map((spaceId, i) => {
        const space = all.find((s) => s.id === spaceId);
        if (!space) return null;
        return (
          <Reorder.Item
            key={space.id}
            as="button"
            value={space.id}
            type="button"
            className={spaces.space}
            data-space-drop={space.id}
            data-drop-target={dropTarget === space.id || undefined}
            aria-label={space.name}
            aria-current={space.id === current}
            title={i < 9 ? `${space.name} (⌃${i + 1})` : space.name}
            dragConstraints={nav}
            dragElastic={0}
            transition={spring.row}
            onDragStart={() => (justDragged.current = true)}
            onDragEnd={() => {
              drop(space.id);
              // Let go off the icon, there's no click to swallow.
              setTimeout(() => (justDragged.current = false));
            }}
            onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => onKeyDown(event, space.id, i)}
            onClick={() => {
              if (justDragged.current) {
                justDragged.current = false;
                return;
              }
              showView('sidebar');
              switchSpace(space.id);
            }}
          >
            <span
              key={landed?.spaceId === space.id ? landed.at : undefined}
              className={spaces.glyphBox}
              data-landed={landed?.spaceId === space.id || undefined}
            >
              <SpaceGlyph icon={space.icon} />
            </span>
          </Reorder.Item>
        );
      })}
    </Reorder.Group>
  );
}

function AddMenu() {
  const archiveAfter = useSidebar((state) => state.model.settings?.archiveAfter ?? '12h');
  const hasLiveFolder = useSidebar((state) => githubFolderOf(state.model) !== undefined);
  const navButtons = useSidebar((state) => state.model.settings.navButtons);
  const sync = useSidebar((state) => state.model.settings.sync);
  const favorites = useSidebar((state) => state.model.settings.numberFavorites);
  const nineIsLast = useSidebar((state) => state.model.settings.nineIsLast);
  const [syncProblem, setSyncProblem] = useState<string>();
  const beside = useBesideMenu();
  return (
    <Menu.Root onOpenChange={(open) => open && void loadSyncProblem().then(setSyncProblem)}>
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
            <Menu.Item className={menu.item} onClick={() => setEditingRoutes(true)}>
              Air Traffic Control…
            </Menu.Item>
            <Menu.Item className={menu.item} onClick={() => setNavButtons(!navButtons)}>
              {navButtons ? 'Hide' : 'Show'} Back, Forward and Reload
            </Menu.Item>
            <Menu.Item
              className={menu.item}
              onClick={() => setNumbering({ favorites: !favorites })}
            >
              {favorites ? 'Leave Favorites Out of ⌘1–9' : 'Include Favorites in ⌘1–9'}
            </Menu.Item>
            <Menu.Item
              className={menu.item}
              onClick={() => setNumbering({ nineIsLast: !nineIsLast })}
            >
              Use ⌘9 for the {nineIsLast ? 'Ninth' : 'Last'} Tab
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
            <Menu.Item className={menu.item} onClick={() => setSync(!sync)}>
              {sync ? 'Stop Syncing Spaces' : 'Sync Spaces Across Computers'}
            </Menu.Item>
            {sync && syncProblem && (
              <Menu.Item className={menu.item} disabled>
                {syncProblem}
              </Menu.Item>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
