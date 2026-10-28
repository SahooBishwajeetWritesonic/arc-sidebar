import type { PointerEvent as ReactPointerEvent } from 'react';
import { create } from 'zustand';
import { isWithin } from '@/model/tree';
import { useSidebar } from '@/state/sidebar';
import { findTarget, type DragSource, type DropTarget, type Slot } from './targets';

export interface Ghost {
  title: string;
  faviconUrl?: string;
  folder: boolean;
  width: number;
}

/** React-visible drag state. It changes only when the drop target changes. */
export const useDrag = create<{
  source: DragSource | null;
  target: DropTarget | null;
  ghost: Ghost | null;
}>()(() => ({ source: null, target: null, ghost: null }));

/** Movement before a press becomes a drag (Arc: about 3–4 pt). */
const THRESHOLD = 4;
/** How near the panel's top or bottom edge a drag starts scrolling it. */
const SCROLL_EDGE = 40;

type GhostContent = Omit<Ghost, 'width'>;

interface Tracking {
  source: DragSource;
  ghost: () => GhostContent;
  onTap?: () => void;
  onDrop: (source: DragSource, target: DropTarget) => void;
  sidebar: HTMLElement;
  row: HTMLElement;
  startX: number;
  startY: number;
  x: number;
  y: number;
  grabX: number;
  grabY: number;
  started: boolean;
  slots: Slot[];
  scrollFrame: number;
}

let tracking: Tracking | null = null;
let ghostElement: HTMLElement | null = null;

/** The ghost layer registers its element here so moves don't go through React. */
export function setGhostElement(element: HTMLElement | null) {
  ghostElement = element;
  placeGhost();
}

/** A press becomes a drag after THRESHOLD of movement; otherwise releasing it is a tap. */
export function beginPress(
  event: ReactPointerEvent<HTMLElement>,
  options: {
    source: DragSource;
    ghost: () => GhostContent;
    onTap?: () => void;
    onDrop: (source: DragSource, target: DropTarget) => void;
  },
) {
  const sidebar = event.currentTarget.closest<HTMLElement>('[data-sidebar]');
  if (event.button !== 0 || !sidebar || tracking) return;
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
    slots: [],
    scrollFrame: 0,
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', onKey, true);
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
  placeGhost();
  updateTarget();
  autoScroll();
}

function start(t: Tracking) {
  t.started = true;
  t.slots = measure(t.sidebar);
  t.sidebar.dataset.dragging = '';
  const width = t.row.getBoundingClientRect().width;
  useDrag.setState({ source: t.source, ghost: { ...t.ghost(), width }, target: null });
}

/** Rows in display order, relative to the sidebar's top edge. */
function measure(sidebar: HTMLElement): Slot[] {
  const top = sidebar.getBoundingClientRect().top;
  const page = sidebar.querySelector('[data-active-page]') ?? sidebar;
  return [...page.querySelectorAll<HTMLElement>('[data-nav-row]')].map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      kind: element.dataset.navRow as Slot['kind'],
      id: element.dataset.rowId ?? 'newtab',
      top: rect.top - top,
      bottom: rect.bottom - top,
      depth: Number(element.dataset.depth ?? 0),
      parentId: element.dataset.parentId || null,
      open: element.dataset.open !== undefined,
    };
  });
}

function updateTarget() {
  if (!tracking?.started) return;
  const y = tracking.y - tracking.sidebar.getBoundingClientRect().top;
  const { model } = useSidebar.getState();
  const { source } = tracking;
  const target = findTarget(tracking.slots, y, source, (folderId) =>
    source.kind === 'folder' ? isWithin(model, folderId, source.itemId) : false,
  );
  if (JSON.stringify(target) !== JSON.stringify(useDrag.getState().target)) {
    useDrag.setState({ target });
  }
}

function placeGhost() {
  if (!tracking || !ghostElement) return;
  const x = tracking.x - tracking.grabX;
  const y = tracking.y - tracking.grabY;
  ghostElement.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

function autoScroll() {
  if (!tracking || tracking.scrollFrame) return;
  const step = () => {
    if (!tracking) return;
    const { y } = tracking;
    const speed =
      y < SCROLL_EDGE
        ? -(SCROLL_EDGE - y) / 3
        : y > innerHeight - SCROLL_EDGE
          ? (y - (innerHeight - SCROLL_EDGE)) / 3
          : 0;
    if (speed === 0) {
      tracking.scrollFrame = 0;
      return;
    }
    window.scrollBy(0, speed);
    updateTarget();
    tracking.scrollFrame = requestAnimationFrame(step);
  };
  tracking.scrollFrame = requestAnimationFrame(step);
}

function onUp() {
  const t = tracking;
  if (!t) return;
  const { target } = useDrag.getState();
  finish();
  if (!t.started) t.onTap?.();
  else if (target) t.onDrop(t.source, target);
}

function onKey(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !tracking?.started) return;
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
  delete tracking.sidebar.dataset.dragging;
  tracking = null;
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('pointercancel', cancel);
  window.removeEventListener('keydown', onKey, true);
  useDrag.setState({ source: null, target: null, ghost: null });
}
