import type { Harmony, SpaceTheme } from '@/model/types';
import {
  contrast,
  hexToRgb,
  hslToRgb,
  mix,
  rgbToHex,
  rgbToHsl,
  rotateHue,
  type Rgb,
} from './color';

/**
 * Space themes, after Arc's model (layered gradients over a base, research/05)
 * and Zen's open-source implementation of it (research/04 §2.5).
 */

export type Scheme = 'light' | 'dark';

/** Hue offsets of a theme's other colours from the first (Zen's harmonies). */
export const HARMONY_OFFSETS: Record<Harmony, number[]> = {
  single: [],
  analogous: [50, 310],
  complementary: [180],
  splitComplementary: [150, 210],
  triadic: [120, 240],
  free: [],
};

export function harmonize(primary: string, harmony: Harmony): string[] {
  return [primary, ...HARMONY_OFFSETS[harmony].map((offset) => rotateHue(primary, offset))];
}

/** The neutral the colours are blended into (themed spaces). */
const BASE: Record<Scheme, string> = { dark: '#1e1f22', light: '#eceef1' };

/** A space without a theme: Arc's default neutral sidebar. */
export const DEFAULT_PLATE: Record<Scheme, string> = { dark: '#36373a', light: '#e7e8ec' };

/** Text as the tokens draw it (--ink): white 92% on dark, black 85% on light. */
const INK: Record<Scheme, { rgb: Rgb; alpha: number }> = {
  dark: { rgb: [255, 255, 255], alpha: 0.92 },
  light: { rgb: [0, 0, 0], alpha: 0.85 },
};

/** WCAG AA for body text. */
const READABLE = 4.5;

export interface ThemeLook {
  /** Light or dark text and overlays on this space. */
  scheme: Scheme;
  /** A CSS `background` value. */
  background: string;
  /** The colour the gradient leads with, for quick swatches. */
  swatch: string;
  /** Grain layer strength, 0–1. */
  grain: number;
}

/**
 * The preferred scheme (Light / Dark / Auto) wins unless its text would be hard to read on
 * the theme, as on a bright yellow in dark mode.
 */
export function themeLook(theme: SpaceTheme | undefined, preferred: Scheme): ThemeLook {
  if (!theme || theme.colors.length === 0) {
    const plate = DEFAULT_PLATE[preferred];
    return { scheme: preferred, background: plate, swatch: plate, grain: 0 };
  }

  const base = hexToRgb(BASE[preferred]);
  const colors = theme.colors
    .slice(0, 3)
    .map((hex) => rgbToHex(mix(base, hexToRgb(hex), theme.intensity)));
  const [c0, c1, c2] = colors as [string, string?, string?];
  const baseHex = BASE[preferred];

  let background: string;
  if (colors.length === 1) {
    background = c0;
  } else if (colors.length === 2) {
    background = [
      `linear-gradient(150deg, ${c0} 30%, transparent 120%)`,
      `linear-gradient(-30deg, ${c1} 30%, transparent 120%)`,
      baseHex,
    ].join(', ');
  } else {
    background = [
      `linear-gradient(-5deg, ${c2} 10%, transparent 80%)`,
      `radial-gradient(circle at 95% 0%, ${c1} 0%, transparent 75%)`,
      `radial-gradient(circle at 0% 0%, ${c0} 10%, transparent 70%)`,
      baseHex,
    ].join(', ');
  }

  return {
    scheme: readableScheme(hexToRgb(c0), preferred),
    background,
    swatch: c0,
    grain: theme.grain,
  };
}

/** Arc's own highlight, for spaces without a theme. */
export const DEFAULT_ACCENT = '#3970c5';

/**
 * The theme's first colour, darkened until white text reads on it (4.5:1), for highlights
 * such as the command bar's selected row, which Arc tints with the space.
 */
export function themeAccent(theme: SpaceTheme | undefined): string {
  const first = theme?.colors[0];
  if (!first) return DEFAULT_ACCENT;
  const white: Rgb = [255, 255, 255];
  const [h, s, start] = rgbToHsl(hexToRgb(first));
  let l = start;
  while (l > 0 && contrast(hslToRgb([h, s, l]), white) < 4.5) l -= 0.01;
  return rgbToHex(hslToRgb([h, s, Math.max(l, 0)]));
}

export function readableScheme(surface: Rgb, preferred: Scheme): Scheme {
  const other: Scheme = preferred === 'dark' ? 'light' : 'dark';
  const score = (scheme: Scheme) =>
    contrast(mix(surface, INK[scheme].rgb, INK[scheme].alpha), surface);
  const mine = score(preferred);
  return mine >= READABLE || mine >= score(other) ? preferred : other;
}

/**
 * Preset pages, nine swatches each as in Arc. Muted approximates Arc's picker image; Pastel,
 * Drab and Greyscale are from its app bundle (research/05 §3); Vivid is ours.
 */
export const PALETTES: { name: string; colors: string[] }[] = [
  {
    name: 'Muted',
    colors: [
      '#eae6e3',
      '#e49cc0',
      '#9d7aa6',
      '#d9615f',
      '#ec9157',
      '#ecd060',
      '#7fd38b',
      '#7fb2d8',
      '#5b5e85',
    ],
  },
  {
    name: 'Pastel',
    colors: [
      '#fdfbfa',
      '#fbeaf3',
      '#ecd2ea',
      '#f7cdd2',
      '#fae1d5',
      '#fef9e7',
      '#e4fcec',
      '#e0f2fb',
      '#c5c6e2',
    ],
  },
  {
    name: 'Vivid',
    colors: [
      '#e5484d',
      '#f76b15',
      '#ffc53d',
      '#46a758',
      '#12a594',
      '#0090ff',
      '#6e56cf',
      '#d6409f',
      '#8e4ec6',
    ],
  },
  {
    name: 'Drab',
    colors: [
      '#4b3b58',
      '#623856',
      '#854444',
      '#a77048',
      '#d1b46a',
      '#cdcca8',
      '#84a885',
      '#34604b',
      '#2d4468',
    ],
  },
  {
    name: 'Greyscale',
    colors: [
      '#ffffff',
      '#e5e5e5',
      '#cccccc',
      '#b2b2b2',
      '#808080',
      '#666666',
      '#333333',
      '#1a1a1a',
      '#000000',
    ],
  },
];

export const NEW_THEME: Omit<SpaceTheme, 'colors'> = {
  harmony: 'analogous',
  intensity: 0.4,
  grain: 0.25,
};
