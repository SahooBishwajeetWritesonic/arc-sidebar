import { useCallback, useRef, useState } from 'react';

/** Base UI keeps popups this far from the panel's edges. */
const EDGE = 5;
/** Submenus sit this far from their menu (their positioner's sideOffset). */
const GAP = 2;
/** The side is chosen here, so Base UI keeps it and only nudges the submenu into the panel. */
const KEEP_SIDE = { side: 'shift', align: 'shift', fallbackAxisSide: 'none' } as const;

/** The room on each side of the menu that holds `trigger`. */
function roomBeside(trigger: HTMLElement | null) {
  const menu = trigger?.closest<HTMLElement>('[role="menu"]');
  if (!menu) return undefined;
  const box = menu.getBoundingClientRect();
  const right = document.documentElement.clientWidth - EDGE - box.right;
  return { menu, right, left: box.left - EDGE };
}

/**
 * Base UI lays a submenu over its menu when the narrow panel has no room beside it; instead
 * the menu moves aside so the submenu opens next to it, as on a Mac, until the menu closes.
 */
export function useBesideMenu() {
  const trigger = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<'inline-end' | 'inline-start'>('inline-end');

  const onOpenChange = useCallback((open: boolean) => {
    const room = open ? roomBeside(trigger.current) : undefined;
    if (room) setSide(room.right >= room.left ? 'inline-end' : 'inline-start');
  }, []);

  const popup = useCallback((element: HTMLElement | null) => {
    const room = roomBeside(trigger.current);
    if (!element || !room) return;
    const { menu, right, left } = room;
    const need = element.offsetWidth + GAP;
    if (right >= left ? need <= right : need <= left) return;
    // Make room on that side, as far as the panel allows.
    const dx = right >= left ? -Math.min(need - right, left) : Math.min(need - left, right);
    const shift = Number(menu.dataset.shift ?? 0) + dx;
    menu.dataset.shift = String(shift);
    menu.style.translate = `${shift}px 0`;
  }, []);

  return {
    root: { onOpenChange },
    positioner: { side, collisionAvoidance: KEEP_SIDE },
    trigger,
    popup,
  };
}
