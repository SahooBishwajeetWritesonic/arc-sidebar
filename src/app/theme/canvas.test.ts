import { describe, expect, it } from 'vitest';
import {
  clampToCircle,
  colorAt,
  firstFromDragged,
  harmonyForCount,
  isLinked,
  linkedPositions,
  nextHarmony,
  positionOf,
} from './canvas';
import { hexToRgb, rgbToHsl } from './color';

const hsl = (hex: string) => rgbToHsl(hexToRgb(hex));

describe('colour canvas', () => {
  it('is pale at the centre and vivid at the rim', () => {
    const [, centreS, centreL] = hsl(colorAt(0, 0));
    const [, rimS, rimL] = hsl(colorAt(1, 0));
    expect(centreS).toBeLessThan(0.3);
    expect(centreL).toBeGreaterThan(0.8);
    expect(rimS).toBeGreaterThan(0.95);
    expect(rimL).toBeCloseTo(0.5, 1);
  });

  it('turns hue with the angle', () => {
    expect(hsl(colorAt(1, 0))[0]).toBeCloseTo(0, 0); // right: red
    expect(hsl(colorAt(-1, 0))[0]).toBeCloseTo(180, 0); // left: cyan
    expect(hsl(colorAt(0, 1))[0]).toBeCloseTo(90, 0); // down
  });

  it('puts a canvas colour back where it came from', () => {
    for (const [x, y] of [
      [0.5, 0.2],
      [-0.3, 0.6],
      [0.1, -0.8],
    ] as const) {
      const [px, py] = positionOf(colorAt(x, y));
      expect(px).toBeCloseTo(x, 1);
      expect(py).toBeCloseTo(y, 1);
    }
  });

  it('places greys by lightness and keeps everything inside the circle', () => {
    const [x, y] = positionOf('#ffffff');
    expect(Math.hypot(x, y)).toBeLessThanOrEqual(1);
    expect(clampToCircle(3, 4)).toEqual([0.6, 0.8]);
  });
});

describe('harmonies on the canvas', () => {
  it('places linked dots at the harmony’s angles, same distance from the centre', () => {
    const [first, second, third] = linkedPositions([0.5, 0], 'triadic');
    expect(first).toEqual([0.5, 0]);
    expect(Math.hypot(...second!)).toBeCloseTo(0.5);
    expect(Math.atan2(second![1], second![0]) * (180 / Math.PI)).toBeCloseTo(120);
    expect(Math.atan2(third![1], third![0]) * (180 / Math.PI)).toBeCloseTo(-120);
  });

  it('turns the whole set when any dot is dragged', () => {
    // Drag the opposite dot to the left: the first dot ends up on the right.
    const first = firstFromDragged([-0.6, 0], 1, 'complementary');
    expect(first[0]).toBeCloseTo(0.6);
    expect(first[1]).toBeCloseTo(0);
  });

  it('cycles the harmonies that fit the number of dots', () => {
    expect(nextHarmony('complementary', 2)).toBe('free');
    expect(nextHarmony('free', 2)).toBe('complementary');
    expect(nextHarmony('analogous', 3)).toBe('splitComplementary');
    expect(nextHarmony('triadic', 3)).toBe('free');
  });

  it('keeps sets linked or free when dots are added or removed', () => {
    expect(harmonyForCount('single', 2)).toBe('complementary');
    expect(harmonyForCount('complementary', 3)).toBe('analogous');
    expect(harmonyForCount('free', 3)).toBe('free');
    expect(harmonyForCount('triadic', 1)).toBe('single');
    expect(isLinked('triadic', 3)).toBe(true);
    expect(isLinked('free', 3)).toBe(false);
    expect(isLinked('triadic', 2)).toBe(false);
  });
});
