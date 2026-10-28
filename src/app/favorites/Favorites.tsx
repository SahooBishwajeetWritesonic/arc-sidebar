import { AnimatePresence, motion } from 'motion/react';
import { useMemo, type PointerEvent } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import {
  closePin,
  dropOn,
  pressPin,
  replacePinUrl,
  resetPin,
  unfavoriteToPinned,
  unpinWithUndo,
} from '@/app/actions';
import { beginPress, useDrag } from '@/app/drag/drag';
import { fade, spring } from '@/app/motion';
import { Favicon } from '@/app/rows/Favicon';
import { RowMenu, type MenuEntry } from '@/app/rows/RowMenu';
import { childrenOf } from '@/model/tree';
import { FAVORITES_ID, type PinItem } from '@/model/types';
import { isSamePage } from '@/model/urls';
import { useSidebar } from '@/state/sidebar';
import { faviconFor, toggleMuted, useTabs } from '@/state/tabs';
import styles from './favorites.module.css';

/**
 * Arc's Favorites: icon-only tiles above every space. One tile fills the width,
 * two and three share it, four or more go four to a row.
 */
export function Favorites() {
  const model = useSidebar((state) => state.model);
  const favorites = useMemo(
    () =>
      childrenOf(model, FAVORITES_ID, null).filter((item): item is PinItem => item.kind === 'pin'),
    [model],
  );
  const target = useDrag((state) => (state.target?.section === 'favorites' ? state.target : null));
  const dragged = useDrag((state) =>
    state.source?.kind === 'favorite' ? state.source.itemId : null,
  );

  // While something is dragged over the grid the tiles make room where it
  // would land; a favorite being rearranged lifts out of its own slot.
  const lifted = target ? dragged : null;
  const shown: (PinItem | 'gap')[] = favorites.filter((favorite) => favorite.id !== lifted);
  if (target) shown.splice(target.index, 0, 'gap');
  if (!shown.length) return null;

  const columns = Math.min(shown.length, 4);
  return (
    <ul
      className={styles.grid}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      aria-label="Favorites"
      data-favorites-grid
    >
      <AnimatePresence initial={false} mode="popLayout">
        {shown.map((favorite) =>
          favorite === 'gap' ? <Gap key="gap" /> : <Tile key={favorite.id} favorite={favorite} />,
        )}
      </AnimatePresence>
    </ul>
  );
}

/** The slot a drop would fill. */
function Gap({ ref }: { ref?: React.Ref<HTMLLIElement> }) {
  return (
    <motion.li
      ref={ref}
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: fade }}
      transition={{ opacity: fade, layout: spring.room }}
      className={`${styles.cell} ${styles.gap}`}
      aria-hidden
    />
  );
}

const stop = (event: PointerEvent) => event.stopPropagation();

function Tile({ favorite, ref }: { favorite: PinItem; ref?: React.Ref<HTMLLIElement> }) {
  const tabId = useSidebar((state) => state.session.bindings[favorite.id]);
  const tab = useTabs((state) => (tabId === undefined ? undefined : state.tabs.get(tabId)));
  const selected = useTabs((state) => tabId !== undefined && state.activeId === tabId);
  const awayFromPin = tab !== undefined && !isSamePage(tab.url, favorite.url);
  const title = awayFromPin ? tab.title : (favorite.customTitle ?? tab?.title ?? favorite.title);

  const menu: MenuEntry[] = [
    ...(awayFromPin
      ? [
          { label: 'Back to Favorite URL', onSelect: () => resetPin(favorite.id) },
          {
            label: 'Replace Favorite URL with Current',
            onSelect: () => replacePinUrl(favorite.id),
          },
        ]
      : []),
    { label: 'Move to Pinned', onSelect: () => unfavoriteToPinned(favorite.id) },
    'separator',
    ...(tab ? [{ label: 'Close Tab', onSelect: () => closePin(favorite.id) }] : []),
    { label: 'Remove from Favorites', onSelect: () => unpinWithUndo(favorite.id), danger: true },
  ];

  return (
    <motion.li
      ref={ref}
      layout="position"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: fade }}
      transition={{ opacity: fade, layout: spring.room }}
      className={styles.cell}
    >
      <RowMenu items={menu} className={styles.tilePlate}>
        <button
          type="button"
          className={styles.tile}
          data-selected={selected || undefined}
          data-favorite-id={favorite.id}
          aria-label={title}
          aria-pressed={selected}
          title={title}
          // Open tabs select on press; an unloaded one opens on a tap, so a drag never opens it.
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            if (tab) pressPin(favorite.id);
            beginPress(event, {
              source: { kind: 'favorite', itemId: favorite.id, bound: tab !== undefined },
              ghost: () => ({
                title,
                faviconUrl: faviconFor(tab?.url ?? favorite.url),
                folder: false,
              }),
              onTap: tab ? undefined : () => pressPin(favorite.id),
              onDrop: dropOn,
            });
          }}
          onMouseDown={(event) => event.button === 1 && event.preventDefault()}
          onAuxClick={(event) => event.button === 1 && closePin(favorite.id)}
          onDoubleClick={() => awayFromPin && resetPin(favorite.id)}
        >
          <Favicon url={tab?.url ?? favorite.url} loading={!!tab?.loading && !tab.favIconUrl} />
          {tab && (tab.audible || tab.muted) && (
            <span
              className={styles.badge}
              role="button"
              aria-label={tab.muted ? 'Unmute' : 'Mute'}
              onPointerDown={stop}
              onClick={(event) => {
                event.stopPropagation();
                toggleMuted(tab.id);
              }}
            >
              {tab.muted ? <VolumeX size={10} /> : <Volume2 size={10} />}
            </span>
          )}
        </button>
      </RowMenu>
    </motion.li>
  );
}
