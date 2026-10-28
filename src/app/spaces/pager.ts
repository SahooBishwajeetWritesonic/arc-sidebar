import { motionValue } from 'motion/react';

/** Shared so the theme backdrop can follow the slide and swipe. Page i sits at x = -i × width. */
export const pagerX = motionValue(0);
export const pagerSize = { width: 0 };

/** How visible page `index` is at track position `x`: 1 when shown, 0 a page away or more. */
export function pageVisibility(x: number, index: number): number {
  if (pagerSize.width === 0) return 0;
  return Math.max(0, 1 - Math.abs(-x / pagerSize.width - index));
}
