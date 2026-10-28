import { describe, expect, it } from 'vitest';
import type { SpaceTheme } from '@/model/types';
import { contrast, hexToRgb, rgbToHex, rotateHue } from './color';
import { DEFAULT_PLATE, harmonize, readableScheme, themeLook } from './engine';

const theme = (colors: string[], intensity = 0.5): SpaceTheme => ({
  colors,
  harmony: 'single',
  intensity,
  grain: 0.25,
});

describe('color helpers', () => {
  it('round-trips hex', () => {
    expect(rgbToHex(hexToRgb('#0090ff'))).toBe('#0090ff');
    expect(hexToRgb('#fff')).toEqual([255, 255, 255]);
  });

  it('rotates hue around the wheel', () => {
    expect(rotateHue('#ff0000', 120)).toBe('#00ff00');
    expect(rotateHue('#ff0000', 240)).toBe('#0000ff');
  });

  it('measures WCAG contrast', () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21);
  });
});

describe('harmonize', () => {
  it('adds partner colours by hue offsets', () => {
    expect(harmonize('#ff0000', 'single')).toEqual(['#ff0000']);
    expect(harmonize('#ff0000', 'complementary')).toEqual(['#ff0000', '#00ffff']);
    expect(harmonize('#ff0000', 'triadic')).toEqual(['#ff0000', '#00ff00', '#0000ff']);
  });
});

describe('themeLook', () => {
  it('uses Arc’s default neutral without a theme', () => {
    expect(themeLook(undefined, 'dark')).toMatchObject({
      scheme: 'dark',
      background: DEFAULT_PLATE.dark,
    });
    expect(themeLook(undefined, 'light')).toMatchObject({
      scheme: 'light',
      background: DEFAULT_PLATE.light,
    });
  });

  it('blends a single colour into the base by intensity', () => {
    const look = themeLook(theme(['#0090ff'], 0.5), 'dark');
    expect(look.background).toMatch(/^#[0-9a-f]{6}$/);
    expect(look.swatch).toBe(look.background);
  });

  it('layers gradients that fade to the base for two and three colours', () => {
    expect(themeLook(theme(['#0090ff', '#e5484d']), 'dark').background).toMatch(
      /^linear-gradient\(150deg.*linear-gradient\(-30deg.*#1e1f22$/,
    );
    expect(themeLook(theme(['#0090ff', '#e5484d', '#46a758']), 'dark').background).toMatch(
      /radial-gradient\(circle at 0% 0%/,
    );
  });

  it('keeps the preferred scheme where its text is readable', () => {
    expect(themeLook(theme(['#2d4468']), 'dark').scheme).toBe('dark');
    expect(themeLook(theme(['#fbeaf3']), 'light').scheme).toBe('light');
  });

  it('flips to dark text on a bright theme in dark mode', () => {
    expect(themeLook(theme(['#ffffff'], 0.8), 'dark').scheme).toBe('light');
  });
});

describe('readableScheme', () => {
  it('keeps white text where it reads well', () => {
    expect(readableScheme([90, 90, 90], 'dark')).toBe('dark');
  });

  it('switches to dark text on mid-grey, where white only reaches about 3.6:1', () => {
    expect(readableScheme([128, 128, 128], 'dark')).toBe('light');
  });
});
