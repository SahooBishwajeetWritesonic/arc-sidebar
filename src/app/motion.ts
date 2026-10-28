import type { Transition } from 'motion/react';

/**
 * Motion tokens, from frame traces of Arc 1.168–1.170 (research/08 §0).
 * Arc's sidebar motion is fast and doesn't overshoot.
 */
export const spring = {
  /** Rows sliding when a tab opens, closes or moves: ~105 ms to settle. */
  row: { type: 'spring', stiffness: 2336, damping: 87, mass: 1 },
  /** Space switch: ~200 ms, critically damped. */
  space: { type: 'spring', stiffness: 1094, damping: 66, mass: 1 },
  /** Favorites making room during a drag: ~265 ms, critically damped. */
  room: { type: 'spring', stiffness: 625, damping: 50, mass: 1 },
} satisfies Record<string, Transition>;

export const ease = {
  /** CSS ease-out; Arc's fades and folder open. */
  out: [0, 0, 0.58, 1],
} satisfies Record<string, Transition['ease']>;

/** A new row's fill fading in, a closed row fading out. */
export const fade: Transition = { duration: 0.1, ease: ease.out };
