import type { Harmony } from '@/model/types';
import { hexToRgb, hslToRgb, rgbToHex, rgbToHsl } from './color';
import { HARMONY_OFFSETS } from './engine';

/**
 * Arc's colour canvas: angle is hue, distance is vividness (as in Zen, research/04 §2.5).
 * Positions run -1…1 from the centre on each axis, y pointing down.
 */

const SATURATION = { centre: 0.25, rim: 1 };
const LIGHTNESS = { centre: 0.86, rim: 0.5 };

export function colorAt(x: number, y: number): string {
  const distance = Math.min(1, Math.hypot(x, y));
  const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  const saturation = SATURATION.centre + (SATURATION.rim - SATURATION.centre) * distance;
  const lightness = LIGHTNESS.centre + (LIGHTNESS.rim - LIGHTNESS.centre) * distance;
  return rgbToHex(hslToRgb([hue, saturation, lightness]));
}

/** Where a colour sits on the canvas (presets that aren't on it land close by). */
export function positionOf(hex: string): [number, number] {
  const [hue, saturation, lightness] = rgbToHsl(hexToRgb(hex));
  const fromLightness = (LIGHTNESS.centre - lightness) / (LIGHTNESS.centre - LIGHTNESS.rim);
  const fromSaturation = (saturation - SATURATION.centre) / (SATURATION.rim - SATURATION.centre);
  // Greys have no hue: place them by lightness alone.
  const distance = Math.max(
    0,
    Math.min(1, saturation < 0.05 ? fromLightness : (fromLightness + fromSaturation) / 2),
  );
  const angle = (hue * Math.PI) / 180;
  return [distance * Math.cos(angle), distance * Math.sin(angle)];
}

export function clampToCircle(x: number, y: number): [number, number] {
  const distance = Math.hypot(x, y);
  return distance <= 1 ? [x, y] : [x / distance, y / distance];
}

export type Point = [number, number];

export const HARMONY_NAMES: Record<Harmony, string> = {
  single: 'One',
  complementary: 'Opposite',
  analogous: 'Analog',
  splitComplementary: 'Split',
  triadic: 'Triad',
  free: 'Free',
};

/** True when the other dots follow the first around the wheel. */
export function isLinked(harmony: Harmony, count: number): boolean {
  return count > 1 && harmony !== 'free' && HARMONY_OFFSETS[harmony].length === count - 1;
}

const rotate = ([x, y]: Point, degrees: number): Point => {
  const angle = (degrees * Math.PI) / 180;
  return [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
};

export function linkedPositions(first: Point, harmony: Harmony): Point[] {
  return [first, ...HARMONY_OFFSETS[harmony].map((offset) => rotate(first, offset))];
}

/** Dragging any dot turns and scales the linked set; returns where the first dot goes. */
export function firstFromDragged(to: Point, index: number, harmony: Harmony): Point {
  const offset = index === 0 ? 0 : (HARMONY_OFFSETS[harmony][index - 1] ?? 0);
  return rotate(to, -offset);
}

export function harmoniesFor(count: number): Harmony[] {
  if (count <= 1) return ['single'];
  if (count === 2) return ['complementary', 'free'];
  return ['analogous', 'splitComplementary', 'triadic', 'free'];
}

export function nextHarmony(current: Harmony, count: number): Harmony {
  const options = harmoniesFor(count);
  return options[(options.indexOf(current) + 1) % options.length]!;
}

/** The harmony after adding or removing a dot: linked sets stay linked, free stays free. */
export function harmonyForCount(current: Harmony, count: number): Harmony {
  if (count <= 1) return 'single';
  if (current === 'free') return 'free';
  return harmoniesFor(count)[0]!;
}
