import { motionValue } from 'motion/react';

/** Shared so the theme backdrop can follow the slide and swipe. Page i sits at x = -i × width. */
export const pagerX = motionValue(0);
/** A motion value so the backdrop follows Chrome opening the panel from zero width. */
export const pagerWidth = motionValue(0);

/** How visible page `index` is at track position `x`: 1 when shown, 0 a page away or more. */
export function pageVisibility(x: number, width: number, index: number): number {
  if (width === 0) return 0;
  return Math.max(0, 1 - Math.abs(-x / width - index));
}
