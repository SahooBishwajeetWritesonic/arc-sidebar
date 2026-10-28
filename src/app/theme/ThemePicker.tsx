import { Popover } from '@base-ui/react/popover';
import { ChevronLeft, ChevronRight, Minus, Moon, Plus, Sparkles, Sun } from 'lucide-react';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import { setAppearance, setSpaceTheme } from '@/app/actions';
import type { Appearance, Harmony, SpaceTheme } from '@/model/types';
import { useSidebar } from '@/state/sidebar';
import { useUi } from '@/state/ui';
import {
  clampToCircle,
  colorAt,
  firstFromDragged,
  HARMONY_NAMES,
  harmonyForCount,
  isLinked,
  linkedPositions,
  nextHarmony,
  positionOf,
  type Point,
} from './canvas';
import { hexToRgb, rgbToHsl, rotateHue } from './color';
import { harmonize, NEW_THEME, PALETTES } from './engine';
import styles from './picker.module.css';

/** Edits are shown at once and saved shortly after the last change, and on close. */
const SAVE_AFTER_MS = 400;
let pendingSave: { spaceId: string; theme: SpaceTheme | null; timer: number } | null = null;

function scheduleSave(spaceId: string, theme: SpaceTheme | null) {
  if (pendingSave) clearTimeout(pendingSave.timer);
  const timer = window.setTimeout(flushSave, SAVE_AFTER_MS);
  pendingSave = { spaceId, theme, timer };
}

function flushSave() {
  if (!pendingSave) return;
  clearTimeout(pendingSave.timer);
  setSpaceTheme(pendingSave.spaceId, pendingSave.theme);
  pendingSave = null;
}

export function openThemePicker(spaceId: string) {
  useUi.setState({ themeEditor: spaceId });
}

function closeThemePicker() {
  flushSave();
  useUi.setState({ themeEditor: null, themePreview: null });
}

const headerOfShownSpace = () =>
  document.querySelector('[data-active-page] [data-space-header]') ?? document.body;

const hueOf = (hex: string) => rgbToHsl(hexToRgb(hex))[0];

/**
 * Arc's theme picker: a canvas of 1–3 colour dots, presets, a grain squiggle
 * and an intensity dial, with light / dark / auto on top.
 */
export function ThemePicker() {
  const spaceId = useUi((state) => state.themeEditor);
  const space = useSidebar((state) => state.model.spaces.find((s) => s.id === spaceId));
  const appearance = useSidebar((state) => state.model.settings?.appearance ?? 'auto');
  const preview = useUi((state) => state.themePreview);
  if (!spaceId || !space) return null;

  const draft = preview?.spaceId === spaceId ? preview.theme : (space.theme ?? null);
  const colors = draft?.colors ?? [];
  const harmony = draft?.harmony ?? 'single';
  const update = (theme: SpaceTheme | null) => {
    useUi.setState({ themePreview: { spaceId, theme } });
    scheduleSave(spaceId, theme);
  };
  const setTheme = (next: string[], nextHarmony: Harmony) =>
    update(next.length ? { ...(draft ?? NEW_THEME), colors: next, harmony: nextHarmony } : null);

  /** A preset becomes the first colour; linked dots follow it, free dots keep their spacing. */
  const pickPreset = (hex: string) => {
    if (!colors.length) return setTheme([hex], 'single');
    if (isLinked(harmony, colors.length)) return setTheme(harmonize(hex, harmony), harmony);
    const lead = hueOf(colors[0]!);
    setTheme([hex, ...colors.slice(1).map((c) => rotateHue(hex, hueOf(c) - lead))], harmony);
  };

  return (
    <Popover.Root open onOpenChange={(open) => !open && closeThemePicker()}>
      <Popover.Portal>
        <Popover.Positioner
          className={styles.positioner}
          anchor={headerOfShownSpace}
          side="bottom"
          align="start"
          sideOffset={6}
        >
          <Popover.Popup className={styles.card} aria-label={`${space.name} theme`}>
            <Popover.Title className={styles.visuallyHidden}>Theme</Popover.Title>
            <ColorCanvas
              colors={colors}
              harmony={harmony}
              onChange={setTheme}
              appearance={appearance}
            />
            <Presets selected={colors[0]} onPick={pickPreset} />
            <div className={styles.controls} data-disabled={!draft || undefined}>
              <GrainSquiggle
                value={draft?.grain ?? NEW_THEME.grain}
                disabled={!draft}
                onChange={(grain) => draft && update({ ...draft, grain })}
              />
              <IntensityDial
                value={draft?.intensity ?? NEW_THEME.intensity}
                disabled={!draft}
                onChange={(intensity) => draft && update({ ...draft, intensity })}
              />
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

const APPEARANCES: { value: Appearance; label: string; Icon: typeof Sun }[] = [
  { value: 'auto', label: 'Auto', Icon: Sparkles },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
];

function useSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => setSize(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

function linkedColors(first: string, harmony: Harmony): string[] {
  const [, ...others] = linkedPositions(positionOf(first), harmony);
  return [first, ...others.map(([x, y]) => colorAt(x, y))];
}

/** Dots stay this far inside the canvas edge. */
const INSET = 22;

/**
 * Drag a dot to change its colour; click empty space to move the first there. Linked dots
 * turn as a set; the glyph between − and + cycles the harmonies that fit.
 */
function ColorCanvas({
  colors,
  harmony,
  onChange,
  appearance,
}: {
  colors: string[];
  harmony: Harmony;
  onChange: (colors: string[], harmony: Harmony) => void;
  appearance: Appearance;
}) {
  const area = useRef<HTMLDivElement>(null);
  const size = useSize(area);
  // While dragging, the dots sit exactly where the pointer put them.
  const [held, setHeld] = useState<Point[] | null>(null);
  const [announced, setAnnounced] = useState<{ name: string; key: number } | null>(null);
  const linked = isLinked(harmony, colors.length);

  useEffect(() => {
    if (!announced) return;
    const timer = setTimeout(() => setAnnounced(null), 1400);
    return () => clearTimeout(timer);
  }, [announced]);

  const positions: Point[] =
    held ??
    (linked && colors[0]
      ? linkedPositions(positionOf(colors[0]), harmony)
      : colors.map(positionOf));
  const reach = size / 2 - INSET;
  const toPx = ([x, y]: Point) => [size / 2 + x * reach, size / 2 + y * reach] as const;

  const pointToCanvas = (event: PointerEvent): Point => {
    const rect = area.current!.getBoundingClientRect();
    return clampToCircle(
      (event.clientX - (rect.left + rect.width / 2)) / reach,
      (event.clientY - (rect.top + rect.height / 2)) / reach,
    );
  };

  const moveTo = (index: number, to: Point) => {
    if (!colors.length) {
      setHeld([to]);
      return onChange([colorAt(...to)], 'single');
    }
    if (linked) {
      const set = linkedPositions(firstFromDragged(to, index, harmony), harmony);
      setHeld(set);
      return onChange(
        set.map(([x, y]) => colorAt(x, y)),
        harmony,
      );
    }
    setHeld(positions.map((point, i) => (i === index ? to : point)));
    onChange(
      colors.map((color, i) => (i === index ? colorAt(...to) : color)),
      harmony,
    );
  };

  const grab = (index: number) => (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    moveTo(index, pointToCanvas(event));
  };
  const drag = (index: number) => (event: PointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) moveTo(index, pointToCanvas(event));
  };
  const nudge = (index: number) => (event: KeyboardEvent) => {
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
      event.key
    ];
    if (!step) return;
    event.preventDefault();
    const [x, y] = positions[index]!;
    moveTo(index, clampToCircle(x + step[0]! * 0.05, y + step[1]! * 0.05));
    setHeld(null);
  };

  /** Applies a harmony: linked ones re-place the other dots around the first. */
  const withHarmony = (next: string[], target: Harmony) =>
    onChange(target === 'free' || next.length < 2 ? next : linkedColors(next[0]!, target), target);

  const add = () => {
    if (!colors.length) return onChange([colorAt(0.48, -0.3)], 'single');
    const target = harmonyForCount(harmony, colors.length + 1);
    const extra = rotateHue(colors[0]!, colors.length === 1 ? 40 : -40);
    withHarmony([...colors, extra], target);
  };
  const remove = () => {
    const next = colors.slice(0, -1);
    withHarmony(next, harmonyForCount(harmony, next.length));
  };
  const cycle = () => {
    const target = nextHarmony(harmony, colors.length);
    withHarmony(colors, target);
    setAnnounced({ name: HARMONY_NAMES[target], key: Date.now() });
  };

  const [cx, cy] = [size / 2, size / 2];
  const orbit = linked && positions[0] ? Math.hypot(...positions[0]) * reach : 0;

  return (
    <div
      ref={area}
      className={styles.canvas}
      data-held={held ? '' : undefined}
      onPointerDown={(event) => {
        // Empty space moves the first dot (and its linked set) there, or places it.
        event.currentTarget.setPointerCapture(event.pointerId);
        moveTo(0, pointToCanvas(event));
      }}
      onPointerMove={drag(0)}
      onPointerUp={() => setHeld(null)}
    >
      {linked && size > 0 && (
        <svg className={styles.guides} aria-hidden>
          <circle cx={cx} cy={cy} r={orbit} className={styles.orbit} />
          {positions.map((point, index) => {
            const [x, y] = toPx(point);
            return <line key={index} x1={cx} y1={cy} x2={x} y2={y} className={styles.guide} />;
          })}
          <circle cx={cx} cy={cy} r={2.5} className={styles.hub} />
        </svg>
      )}

      <div className={styles.appearance} onPointerDown={(event) => event.stopPropagation()}>
        {APPEARANCES.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            aria-label={label}
            aria-pressed={appearance === value}
            title={label}
            onClick={() => setAppearance(value)}
          >
            <Icon size={15} strokeWidth={1.75} />
          </button>
        ))}
      </div>

      {size > 0 &&
        colors.map((color, index) => {
          const [x, y] = toPx(positions[index] ?? [0, 0]);
          return (
            <button
              key={index}
              type="button"
              className={styles.dot}
              data-primary={index === 0 || undefined}
              aria-label={index === 0 ? 'Main colour' : `Colour ${index + 1}`}
              style={{ background: color, left: x, top: y }}
              onPointerDown={grab(index)}
              onPointerMove={drag(index)}
              onPointerUp={() => setHeld(null)}
              onKeyDown={nudge(index)}
            />
          );
        })}

      <span className={styles.announce} key={announced?.key} data-show={announced ? '' : undefined}>
        {announced?.name}
      </span>
      <div className={styles.dotButtons} onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" aria-label="Remove colour" disabled={!colors.length} onClick={remove}>
          <Minus size={14} strokeWidth={2} />
        </button>
        <button
          type="button"
          className={styles.harmony}
          aria-label={`Colour harmony: ${HARMONY_NAMES[harmony]}`}
          title={`${HARMONY_NAMES[harmony]} · click to change`}
          disabled={colors.length < 2}
          onClick={cycle}
        >
          <HarmonyGlyph harmony={colors.length < 2 ? 'single' : harmony} />
        </button>
        <button type="button" aria-label="Add colour" disabled={colors.length >= 3} onClick={add}>
          <Plus size={14} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

/** A tiny wheel drawn in the current arrangement. */
function HarmonyGlyph({ harmony }: { harmony: Harmony }) {
  const dots: Point[] =
    harmony === 'free'
      ? [
          [0, -6],
          [4.5, 1.5],
          [-3, 3.5],
        ]
      : linkedPositions([0, -6.5], harmony);
  return (
    <svg width="18" height="18" viewBox="-9 -9 18 18" aria-hidden>
      <circle r="7.5" className={styles.glyphRing} />
      {dots.map(([x, y], index) => (
        <circle key={index} cx={x} cy={y} r={index === 0 ? 2.3 : 1.7} className={styles.glyphDot} />
      ))}
    </svg>
  );
}

function Presets({ selected, onPick }: { selected?: string; onPick: (hex: string) => void }) {
  const [page, setPage] = useState(0);
  const palette = PALETTES[page]!;
  return (
    <div className={styles.presets}>
      <button
        type="button"
        className={styles.chevron}
        aria-label="Previous colours"
        disabled={page === 0}
        onClick={() => setPage(page - 1)}
      >
        <ChevronLeft size={16} strokeWidth={2} />
      </button>
      <div className={styles.swatches} role="group" aria-label={`${palette.name} colours`}>
        {palette.colors.map((hex) => (
          <button
            key={hex}
            type="button"
            className={styles.swatch}
            style={{ background: hex }}
            aria-label={`${palette.name} ${hex}`}
            aria-pressed={selected === hex}
            onClick={() => onPick(hex)}
          />
        ))}
      </div>
      <button
        type="button"
        className={styles.chevron}
        aria-label="Next colours"
        disabled={page === PALETTES.length - 1}
        onClick={() => setPage(page + 1)}
      >
        <ChevronRight size={16} strokeWidth={2} />
      </button>
    </div>
  );
}

/** Keyboard and pointer behaviour shared by the squiggle and the dial. */
function useSlider(
  value: number,
  [min, max, step]: [number, number, number],
  onChange: (value: number) => void,
  fromPointer: (event: PointerEvent<HTMLElement>) => number,
) {
  const set = (next: number) =>
    onChange(Math.round(Math.max(min, Math.min(max, next)) / step) * step);
  return {
    role: 'slider',
    tabIndex: 0,
    'aria-valuemin': min,
    'aria-valuemax': max,
    'aria-valuenow': Number(value.toFixed(3)),
    onKeyDown: (event: KeyboardEvent) => {
      const moves: Record<string, number> = {
        ArrowLeft: value - step,
        ArrowDown: value - step,
        ArrowRight: value + step,
        ArrowUp: value + step,
        Home: min,
        End: max,
      };
      if (!(event.key in moves)) return;
      event.preventDefault();
      set(moves[event.key]!);
    },
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      set(fromPointer(event));
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) set(fromPointer(event));
    },
  } as const;
}

/** Arc's grain control: a wave with a pill thumb; the wave is darker before it. */
const WAVE = Array.from({ length: 101 }, (_, i) => {
  const x = i * 2;
  return `${i ? 'L' : 'M'}${x} ${22 + 8 * Math.sin((x / 200) * Math.PI * 2 * 4.5)}`;
}).join(' ');

function GrainSquiggle({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const slider = useSlider(value, [0, 1, 1 / 16], onChange, (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return (event.clientX - rect.left) / rect.width;
  });
  return (
    <div className={styles.squiggle} aria-label="Grain" aria-disabled={disabled} {...slider}>
      <svg viewBox="0 0 200 44" preserveAspectRatio="none" aria-hidden>
        <defs>
          <clipPath id="grain-before">
            <rect x="0" y="0" width={value * 200} height="44" />
          </clipPath>
          <clipPath id="grain-after">
            <rect x={value * 200} y="0" width={200 - value * 200} height="44" />
          </clipPath>
        </defs>
        <path d={WAVE} className={styles.waveBefore} clipPath="url(#grain-before)" />
        <path d={WAVE} className={styles.waveAfter} clipPath="url(#grain-after)" />
      </svg>
      <span className={styles.thumb} style={{ left: `${value * 100}%` }} />
    </div>
  );
}

/** Arc's intensity dial: a knob with a ring of ticks, turned through 270°. */
const DIAL_SWEEP = 135;
const TICKS = 25;

function IntensityDial({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const [min, max] = [0.25, 0.8];
  const angle = -DIAL_SWEEP + ((value - min) / (max - min)) * DIAL_SWEEP * 2;
  const slider = useSlider(value, [min, max, 0.01], onChange, (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
    return (
      min +
      ((Math.max(-DIAL_SWEEP, Math.min(DIAL_SWEEP, degrees)) + DIAL_SWEEP) / (DIAL_SWEEP * 2)) *
        (max - min)
    );
  });
  return (
    <div className={styles.dial} aria-label="Intensity" aria-disabled={disabled} {...slider}>
      {Array.from({ length: TICKS }, (_, i) => {
        const tick = -DIAL_SWEEP + (i / (TICKS - 1)) * DIAL_SWEEP * 2;
        return (
          <span
            key={i}
            className={styles.tick}
            data-on={tick <= angle + 0.5 || undefined}
            style={{ transform: `rotate(${tick}deg) translateY(-31px)` }}
          />
        );
      })}
      <span className={styles.knob} style={{ transform: `rotate(${angle}deg)` }}>
        <span className={styles.knobMark} />
      </span>
    </div>
  );
}
