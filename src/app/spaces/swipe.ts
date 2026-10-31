/**
 * From Dia's paging code (TBC's ARCUI PageSwipeController, research/08 §0).
 * Track positions are px, negative as pages move left: page i sits at -i × width.
 */

/** Pages move at half the trackpad's scroll distance. */
export const SWIPE_SCALE = 0.5;

/** A release faster than 5 pt/s (in px per ms) commits in its direction. */
export const COMMIT_VELOCITY = 0.005;

/** Resistance past the first and last space. */
export function rubberBand(overshoot: number): number {
  return 255 * (1 - 1 / ((0.15 * overshoot) / 255 + 1));
}

/** The track during a swipe from `startIndex`: at most one page either way, rubber-banded. */
export function constrainTrack(raw: number, startIndex: number, count: number, width: number) {
  const first = 0;
  const last = -(count - 1) * width;
  if (raw > first) return first + rubberBand(raw - first);
  if (raw < last) return last - rubberBand(last - raw);
  const next = -Math.min(count - 1, startIndex + 1) * width;
  const previous = -Math.max(0, startIndex - 1) * width;
  return Math.min(previous, Math.max(next, raw));
}

/**
 * A deliberate flick goes to the next page edge in its direction, so a small swipe switches
 * and flicking back from halfway returns; otherwise the nearest page.
 */
export function releaseTarget(
  x: number,
  velocity: number,
  startIndex: number,
  count: number,
  width: number,
): number {
  const position = -x / width;
  let target: number;
  if (Math.abs(velocity) >= COMMIT_VELOCITY) {
    target = velocity < 0 ? Math.ceil(position - 1e-6) : Math.floor(position + 1e-6);
  } else {
    target = Math.round(position);
  }
  const lowest = Math.max(0, startIndex - 1);
  const highest = Math.min(count - 1, startIndex + 1);
  return Math.max(lowest, Math.min(highest, target));
}

/** px from 0 (closed) to `width` (open), resisted past open. */
export function constrainLibrary(raw: number, width: number): number {
  if (raw > width) return width + rubberBand(raw - width);
  return Math.max(0, raw);
}

/** A flick decides; else whichever side it's nearer. */
export function libraryStaysOpen(reveal: number, velocity: number, width: number): boolean {
  if (Math.abs(velocity) >= COMMIT_VELOCITY) return velocity > 0;
  return reveal > width / 2;
}
