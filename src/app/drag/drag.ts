import type { PointerEvent as ReactPointerEvent } from 'react';
import { create } from 'zustand';
import { isWithin } from '@/model/tree';
import { FAVORITES_LIMIT, type SpaceIcon } from '@/model/types';
import { useSidebar } from '@/state/sidebar';
import { useTabs } from '@/state/tabs';
import {
  findTarget,
  type DragSource,
  type DropTarget,
  type FavoritesZone,
  type Slot,
} from './targets';

export interface Ghost {
  title: string;
  faviconUrl?: string;
  folder: boolean;
  /** A folder's or pinned tab's own icon, from Change Icon. */
  icon?: SpaceIcon;
  width: number;
  /** Rows moving together, when a selection is dragged. */
  count?: number;
}

/** React-visible drag state. It changes only when the drop target changes. */
export const useDrag = create<{
  source: DragSource | null;
  target: DropTarget | null;
  ghost: Ghost | null;
  /** Option is held: the drop leaves a copy (Arc's Option-drag). */
  copying: boolean;
  /** The space icon last dropped on. */
  landed: { spaceId: string; at: number } | null;
}>()(() => ({ source: null, target: null, ghost: null, copying: false, landed: null }));

/** How a drop ends: `copy` when Option was held as it was let go. */
export interface DropHow {
  copy: boolean;
}

/** Movement before a press becomes a drag (Arc: about 3–4 pt). */
const THRESHOLD = 4;
/** Distance from the shown space's top or bottom edge where it starts scrolling. */
const SCROLL_EDGE = 40;
/** Rows changed mid-drag have finished sliding by then (spring.row: ~105 ms). */
const SETTLE_MS = 150;

type GhostContent = Omit<Ghost, 'width'>;

/** Tiles from the page's top, as Favorites don't scroll with it. */
interface FavoritesLayout {
  cells: FavoritesZone['cells'];
  titleMiddle: number;
  full: boolean;
}

interface Tracking {
  source: DragSource;
  ghost: () => GhostContent;
  onTap?: () => void;
  onDrop: (source: DragSource, target: DropTarget, how: DropHow) => void;
  sidebar: HTMLElement;
  row: HTMLElement;
  startX: number;
  startY: number;
  x: number;
  y: number;
  grabX: number;
  grabY: number;
  started: boolean;
  page: HTMLElement | null;
  slots: Slot[];
  favorites?: FavoritesLayout;
  spaces: { id: string; rect: DOMRect }[];
  scrollFrame: number;
  /** Stops watching for rows changing under the drag. */
  unwatch?: () => void;
  remeasure?: ReturnType<typeof setTimeout>;
}

let tracking: Tracking | null = null;
let ghostElement: HTMLElement | null = null;

/** The ghost layer registers its element here so moves don't go through React. */
export function setGhostElement(element: HTMLElement | null) {
  ghostElement = element;
  placeGhost();
}

/** A plain left press. Control-click is a right-click on a Mac and must only open the menu. */
export const isPress = (event: { button: number; ctrlKey: boolean }) =>
  event.button === 0 && !event.ctrlKey;

/** A press becomes a drag after THRESHOLD of movement; otherwise releasing it is a tap. */
export function beginPress(
  event: ReactPointerEvent<HTMLElement>,
  options: {
    source: DragSource;
    ghost: () => GhostContent;
    onTap?: () => void;
    onDrop: (source: DragSource, target: DropTarget, how: DropHow) => void;
  },
) {
  const sidebar = event.currentTarget.closest<HTMLElement>('[data-sidebar]');
  if (!isPress(event) || !sidebar || tracking) return;
  const rect = event.currentTarget.getBoundingClientRect();
  tracking = {
    ...options,
    sidebar,
    row: event.currentTarget,
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    grabX: event.clientX - rect.left,
    grabY: event.clientY - rect.top,
    started: false,
    page: null,
    slots: [],
    spaces: [],
    scrollFrame: 0,
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
}

function onMove(event: PointerEvent) {
  if (!tracking) return;
  tracking.x = event.clientX;
  tracking.y = event.clientY;
  if (!tracking.started) {
    const distance = Math.hypot(event.clientX - tracking.startX, event.clientY - tracking.startY);
    if (distance < THRESHOLD) return;
    start(tracking);
  }
  updateTarget();
  placeGhost();
  autoScroll();
  copyWhile(event.altKey);
}

function copyWhile(altKey: boolean) {
  if (tracking?.started && useDrag.getState().copying !== altKey) {
    useDrag.setState({ copying: altKey });
  }
}

function start(t: Tracking) {
  t.started = true;
  measureAll(t, activePage(t.sidebar));
  t.sidebar.dataset.dragging = '';
  const width = t.row.getBoundingClientRect().width;
  useDrag.setState({ source: t.source, ghost: { ...t.ghost(), width }, target: null });
  const unwatchTabs = useTabs.subscribe(onRowsChanged);
  const unwatchSidebar = useSidebar.subscribe(onRowsChanged);
  t.unwatch = () => {
    unwatchTabs();
    unwatchSidebar();
  };
}

/**
 * Tabs or the sidebar changed mid-drag: end the drag if its source is gone, else re-measure
 * once rows have slid into place, so the drop lands where the line shows.
 */
function onRowsChanged() {
  const t = tracking;
  if (!t?.started) return;
  if (!exists(t.source)) return cancel();
  clearTimeout(t.remeasure);
  t.remeasure = setTimeout(() => {
    if (tracking !== t) return;
    measureAll(t, activePage(t.sidebar));
    updateTarget();
  }, SETTLE_MS);
}

function exists(source: DragSource): boolean {
  const { tabs } = useTabs.getState();
  const { items } = useSidebar.getState().model;
  switch (source.kind) {
    case 'tab':
      return tabs.has(source.tabId);
    case 'split':
      return source.tabIds.every((id) => tabs.has(id));
    case 'many':
      return source.tabIds.every((id) => tabs.has(id)) && source.itemIds.every((id) => items[id]);
    default:
      return items[source.itemId] !== undefined;
  }
}

const activePage = (sidebar: HTMLElement) =>
  sidebar.querySelector<HTMLElement>('[data-active-page]');

/** The top of the page's content in viewport coordinates (it scrolls). */
const contentTop = (page: HTMLElement) => page.getBoundingClientRect().top - page.scrollTop;

function measureAll(t: Tracking, page: HTMLElement | null) {
  t.page = page;
  t.slots = page ? measure(t.sidebar, page) : [];
  t.favorites = page ? measureFavorites(t.sidebar, page) : undefined;
  t.spaces = [...document.querySelectorAll<HTMLElement>('[data-space-drop]')].map((icon) => ({
    id: icon.dataset.spaceDrop!,
    rect: icon.getBoundingClientRect(),
  }));
}

/** Rows in display order, relative to the top of the page's content. */
function measure(sidebar: HTMLElement, page: HTMLElement): Slot[] {
  const top = contentTop(page);
  const left = sidebar.getBoundingClientRect().left;
  return [...page.querySelectorAll<HTMLElement>('[data-nav-row]')].map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      kind: element.dataset.navRow as Slot['kind'],
      id: element.dataset.rowId ?? 'newtab',
      top: rect.top - top,
      bottom: rect.bottom - top,
      left: rect.left - left,
      right: rect.right - left,
      depth: Number(element.dataset.depth ?? 0),
      parentId: element.dataset.parentId || null,
      open: element.dataset.open !== undefined,
    };
  });
}

/** The Favorites grid and the strip above the shown space's title, where a drop favorites. */
function measureFavorites(sidebar: HTMLElement, page: HTMLElement): FavoritesLayout | undefined {
  const header = page.querySelector('[data-space-header]');
  if (!header) return undefined;
  const top = page.getBoundingClientRect().top;
  const left = sidebar.getBoundingClientRect().left;
  const cells = [...sidebar.querySelectorAll<HTMLElement>('[data-favorite-id]')].map((tile) => {
    const rect = tile.getBoundingClientRect();
    return {
      id: tile.dataset.favoriteId!,
      left: rect.left - left,
      right: rect.right - left,
      top: rect.top - top,
      bottom: rect.bottom - top,
    };
  });
  const title = header.getBoundingClientRect();
  return {
    cells,
    titleMiddle: title.top + title.height / 2 - contentTop(page),
    full: cells.length >= FAVORITES_LIMIT,
  };
}

function favoritesZone(layout: FavoritesLayout, scroll: number): FavoritesZone {
  return {
    // To the title's middle, so an empty grid is easy to hit.
    bottom: Math.max(scroll, layout.titleMiddle),
    cells: layout.cells.map((cell) => ({
      ...cell,
      top: cell.top + scroll,
      bottom: cell.bottom + scroll,
    })),
    full: layout.full,
  };
}

/** Everything dragged is in that space already. */
function alreadyIn(source: DragSource, spaceId: string): boolean {
  const { model, session, spaceId: shown } = useSidebar.getState();
  const { items } = model;
  const tabIn = (tabId: number) => (session.tabSpaces[tabId] ?? shown) === spaceId;
  const itemIn = (itemId: string) => items[itemId]?.spaceId === spaceId;
  switch (source.kind) {
    case 'tab':
      return tabIn(source.tabId);
    case 'split':
      return source.tabIds.every(tabIn);
    case 'many':
      return source.tabIds.every(tabIn) && source.itemIds.every(itemIn);
    default:
      return itemIn(source.itemId);
  }
}

function updateTarget() {
  if (!tracking?.started) return;
  const target = targetOf(tracking);
  if (JSON.stringify(target) !== JSON.stringify(useDrag.getState().target)) {
    useDrag.setState({ target });
  }
}

function targetOf(t: Tracking): DropTarget | null {
  const { x, y, source, page } = t;
  const icon = t.spaces.find(
    ({ rect }) => x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom,
  );
  if (icon) return alreadyIn(source, icon.id) ? null : { section: 'space', spaceId: icon.id };
  if (!page) return null;

  const scroll = page.scrollTop;
  const point = {
    x: x - t.sidebar.getBoundingClientRect().left,
    y: y - page.getBoundingClientRect().top + scroll,
  };
  const { model } = useSidebar.getState();
  return findTarget(
    t.slots,
    point,
    source,
    (folderId) => {
      const folder = model.items[folderId];
      if (folder?.kind === 'folder' && folder.live) return true;
      return source.kind === 'folder' && isWithin(model, folderId, source.itemId);
    },
    t.favorites && favoritesZone(t.favorites, scroll),
  );
}

/** Over Favorites the ghost becomes a tile centred on the pointer, as in Arc. */
export const GHOST_TILE = { width: 72, height: 47 };
/** Over a space's icon it shrinks to its favicon, above the pointer. */
export const GHOST_CHIP = 28;

function placeGhost() {
  if (!tracking || !ghostElement) return;
  const section = useDrag.getState().target?.section;
  const [x, y] =
    section === 'favorites'
      ? [tracking.x - GHOST_TILE.width / 2, tracking.y - GHOST_TILE.height / 2]
      : section === 'space'
        ? [tracking.x - GHOST_CHIP / 2, tracking.y - GHOST_CHIP - 10]
        : [tracking.x - tracking.grabX, tracking.y - tracking.grabY];
  ghostElement.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  // A selection's count sits by the pointer, as in Finder, where the panel's edge can't cut it off.
  ghostElement.style.setProperty('--grab-x', `${tracking.grabX}px`);
}

function autoScroll() {
  if (!tracking || tracking.scrollFrame) return;
  const step = () => {
    if (!tracking) return;
    const { y, page } = tracking;
    const overIcon = useDrag.getState().target?.section === 'space';
    const speed = page && !overIcon ? scrollSpeed(y, page.getBoundingClientRect()) : 0;
    if (speed === 0) {
      tracking.scrollFrame = 0;
      return;
    }
    page!.scrollBy(0, speed);
    updateTarget();
    tracking.scrollFrame = requestAnimationFrame(step);
  };
  tracking.scrollFrame = requestAnimationFrame(step);
}

/** Not above the page, where a drop goes to Favorites. */
function scrollSpeed(y: number, { top, bottom }: DOMRect): number {
  if (y >= top && y < top + SCROLL_EDGE) return -(top + SCROLL_EDGE - y) / 3;
  if (y > bottom - SCROLL_EDGE) return Math.min(y - (bottom - SCROLL_EDGE), SCROLL_EDGE) / 3;
  return 0;
}

function onUp(event: PointerEvent) {
  const t = tracking;
  if (!t) return;
  const { target } = useDrag.getState();
  finish();
  if (!t.started) t.onTap?.();
  else if (target) {
    t.onDrop(t.source, target, { copy: event.altKey });
    if (target.section === 'space') {
      useDrag.setState({ landed: { spaceId: target.spaceId, at: Date.now() } });
    }
  }
}

function onKey(event: KeyboardEvent) {
  if (event.key === 'Alt') return copyWhile(event.type === 'keydown');
  if (event.type !== 'keydown' || event.key !== 'Escape' || !tracking?.started) return;
  event.preventDefault();
  event.stopPropagation();
  cancel();
}

function cancel() {
  finish();
}

function finish() {
  if (!tracking) return;
  cancelAnimationFrame(tracking.scrollFrame);
  clearTimeout(tracking.remeasure);
  tracking.unwatch?.();
  delete tracking.sidebar.dataset.dragging;
  tracking = null;
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', cancel);
  window.removeEventListener('keydown', onKey, true);
  window.removeEventListener('keyup', onKey, true);
  useDrag.setState({ source: null, target: null, ghost: null, copying: false });
}
