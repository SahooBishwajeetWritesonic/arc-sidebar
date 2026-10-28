import { describe, expect, it } from 'vitest';
import { constrainTrack, releaseTarget, rubberBand } from './swipe';

const W = 360;

describe('rubberBand', () => {
  it('starts near 1:1 and resists more the further it goes', () => {
    expect(rubberBand(0)).toBe(0);
    expect(rubberBand(10)).toBeCloseTo(1.5, 0);
    expect(rubberBand(1000)).toBeLessThan(255);
  });
});

describe('constrainTrack', () => {
  it('moves freely between neighbouring pages', () => {
    expect(constrainTrack(-500, 1, 3, W)).toBe(-500);
  });

  it('stops at one page from where the swipe began', () => {
    expect(constrainTrack(-900, 0, 5, W)).toBe(-W); // started on page 0, can reach page 1 only
    expect(constrainTrack(-100, 3, 5, W)).toBe(-2 * W);
  });

  it('rubber-bands past the first and last space', () => {
    expect(constrainTrack(100, 0, 3, W)).toBeCloseTo(rubberBand(100));
    expect(constrainTrack(-2 * W - 100, 2, 3, W)).toBeCloseTo(-2 * W - rubberBand(100));
  });
});

describe('releaseTarget', () => {
  it('commits a small flick in its direction', () => {
    expect(releaseTarget(-W - 8, -0.2, 1, 3, W)).toBe(2);
    expect(releaseTarget(-W + 8, 0.2, 1, 3, W)).toBe(0);
  });

  it('returns when flicked back from part way', () => {
    expect(releaseTarget(-1.6 * W, 0.3, 1, 3, W)).toBe(1);
  });

  it('settles on the nearest page without a flick', () => {
    expect(releaseTarget(-1.6 * W, 0, 1, 3, W)).toBe(2);
    expect(releaseTarget(-1.4 * W, 0.001, 1, 3, W)).toBe(1);
  });

  it('never goes past the ends or more than one page', () => {
    expect(releaseTarget(40, 0.5, 0, 3, W)).toBe(0);
    expect(releaseTarget(-2 * W, -0.5, 2, 3, W)).toBe(2);
  });
});
