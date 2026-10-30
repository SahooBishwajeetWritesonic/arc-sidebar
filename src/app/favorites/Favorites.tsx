import { AnimatePresence, motion } from 'motion/react';
import { useMemo, type PointerEvent } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import {
  closePin,
  closePinnedSplit,
  dropOn,
  pressPin,
  replacePinUrl,
  resetPin,
  separatePinnedSplit,
  setPinIcon,
  unfavoritePair,
  unfavoriteToPinned,
  unpinSplit,
  unpinWithUndo,
} from '@/app/actions';
import { beginPress, isPress, useDrag } from '@/app/drag/drag';
import { fade, spring } from '@/app/motion';
import { Favicon } from '@/app/rows/Favicon';
import { RowMenu, type MenuEntry } from '@/app/rows/RowMenu';
import { iconMenu, SpaceGlyph } from '@/app/spaces/icons';
import { childrenOf, partnerOf } from '@/model/tree';
import { FAVORITES_ID, type PinItem } from '@/model/types';
import { isSamePage } from '@/model/urls';
import { useSidebar } from '@/state/sidebar';
import { faviconFor, toggleMuted, useTabs } from '@/state/tabs';
import styles from './favorites.module.css';
import { unreadCount } from './unread';

/** A favorite's tile: one pin, or a favorited split's two (left, then `partner`). */
interface TileItem {
  favorite: PinItem;
  partner?: PinItem;
}

/**
 * Arc's Favorites: one tile fills the width, two and three share it, four or more go four
 * to a row. A favorited split is one tile with both icons.
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
  const shown: (TileItem | 'gap')[] = tilesOf(model, favorites).filter(
    ({ favorite }) => favorite.id !== lifted,
  );
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
        {shown.map((tile) =>
          tile === 'gap' ? (
            <Gap key="gap" />
          ) : (
            <Tile key={tile.favorite.id} favorite={tile.favorite} partner={tile.partner} />
          ),
        )}
      </AnimatePresence>
    </ul>
  );
}

/** Favorites as tiles: a favorited split's right pin goes on its left one's tile. */
function tilesOf(model: Parameters<typeof partnerOf>[0], favorites: PinItem[]): TileItem[] {
  const tiles: TileItem[] = [];
  for (let i = 0; i < favorites.length; i++) {
    const favorite = favorites[i]!;
    const partner = partnerOf(model, favorite);
    if (partner && favorites[i + 1]?.id === partner.id) {
      tiles.push({ favorite, partner });
      i++;
    } else tiles.push({ favorite });
  }
  return tiles;
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

function useFavoriteTab(favorite: PinItem | undefined) {
  const tabId = useSidebar((state) => (favorite ? state.session.bindings[favorite.id] : undefined));
  return useTabs((state) => (tabId === undefined ? undefined : state.tabs.get(tabId)));
}

function Tile({ favorite, partner, ref }: TileItem & { ref?: React.Ref<HTMLLIElement> }) {
  const tab = useFavoriteTab(favorite);
  const partnerTab = useFavoriteTab(partner);
  const selected = useTabs(
    (state) =>
      state.activeId !== null && (state.activeId === tab?.id || state.activeId === partnerTab?.id),
  );
  const awayFromPin = !partner && tab !== undefined && !isSamePage(tab.url, favorite.url);
  const titleOf = (pin: PinItem, open: typeof tab) => pin.customTitle ?? open?.title ?? pin.title;
  const title = partner
    ? `${titleOf(favorite, tab)} | ${titleOf(partner, partnerTab)}`
    : awayFromPin
      ? tab.title
      : titleOf(favorite, tab);
  const pair = partner ? ([favorite.id, partner.id] as [string, string]) : undefined;
  const open = tab !== undefined || partnerTab !== undefined;
  // The one whose sound shows on the badge: the left tab's, else the right's.
  const sounding = [tab, partnerTab].find((each) => each && (each.audible || each.muted));
  const unread = [tab, partnerTab].map((each) => each && unreadCount(each.title)).find(Boolean);

  // A split's icon is its left pin's, standing for both.
  const changeIcon: MenuEntry = {
    label: 'Change Icon',
    submenu: iconMenu(favorite.icon, (icon) => setPinIcon(favorite.id, icon)),
  };
  const menu: MenuEntry[] = pair
    ? [
        changeIcon,
        { label: 'Move to Pinned', onSelect: () => unfavoritePair(pair) },
        { label: 'Separate All Tabs', onSelect: () => separatePinnedSplit(pair) },
        'separator',
        ...(open ? [{ label: 'Close Split', onSelect: () => closePinnedSplit(pair) }] : []),
        { label: 'Remove from Favorites', onSelect: () => unpinSplit(pair), danger: true },
      ]
    : [
        ...(awayFromPin
          ? [
              { label: 'Back to Favorite URL', onSelect: () => resetPin(favorite.id) },
              {
                label: 'Replace Favorite URL with Current',
                onSelect: () => replacePinUrl(favorite.id),
              },
            ]
          : []),
        changeIcon,
        { label: 'Move to Pinned', onSelect: () => unfavoriteToPinned(favorite.id) },
        'separator',
        ...(tab ? [{ label: 'Close Tab', onSelect: () => closePin(favorite.id) }] : []),
        {
          label: 'Remove from Favorites',
          onSelect: () => unpinWithUndo(favorite.id),
          danger: true,
        },
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
          data-split={pair ? true : undefined}
          data-unread={unread ? true : undefined}
          aria-label={title}
          aria-pressed={selected}
          title={title}
          // Open tabs select on press; an unloaded favorite opens on a tap, so a
          // drag never opens it. A split opens both, side by side.
          onPointerDown={(event) => {
            if (!isPress(event)) return;
            const ready = pair ? tab !== undefined && partnerTab !== undefined : tab !== undefined;
            if (ready) pressPin(favorite.id);
            beginPress(event, {
              source: { kind: 'favorite', itemId: favorite.id, bound: ready },
              ghost: () => ({
                title,
                faviconUrl: faviconFor(tab?.url ?? favorite.url),
                folder: false,
                icon: favorite.icon,
              }),
              onTap: ready ? undefined : () => pressPin(favorite.id),
              onDrop: dropOn,
            });
          }}
          onMouseDown={(event) => event.button === 1 && event.preventDefault()}
          onAuxClick={(event) =>
            event.button === 1 && (pair ? closePinnedSplit(pair) : closePin(favorite.id))
          }
          onDoubleClick={() => awayFromPin && resetPin(favorite.id)}
        >
          {favorite.icon ? (
            <SpaceGlyph icon={favorite.icon} />
          ) : partner ? (
            <span className={styles.split}>
              <Favicon url={tab?.url ?? favorite.url} loading={!!tab?.loading && !tab.favIconUrl} />
              <span className={styles.splitLine} aria-hidden />
              <Favicon
                url={partnerTab?.url ?? partner.url}
                loading={!!partnerTab?.loading && !partnerTab.favIconUrl}
              />
            </span>
          ) : (
            <Favicon url={tab?.url ?? favorite.url} loading={!!tab?.loading && !tab.favIconUrl} />
          )}
          {unread && (
            <span className={styles.unread} aria-hidden>
              {unread}
            </span>
          )}
          {sounding && (
            <span
              className={styles.badge}
              role="button"
              aria-label={sounding.muted ? 'Unmute' : 'Mute'}
              onPointerDown={stop}
              onClick={(event) => {
                event.stopPropagation();
                toggleMuted(sounding.id);
              }}
            >
              {sounding.muted ? <VolumeX size={10} /> : <Volume2 size={10} />}
            </span>
          )}
        </button>
      </RowMenu>
    </motion.li>
  );
}
