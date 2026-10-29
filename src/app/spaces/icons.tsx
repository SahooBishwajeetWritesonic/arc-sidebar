import {
  BookOpen,
  Briefcase,
  Camera,
  Cloud,
  Code,
  Coffee,
  Flame,
  Globe,
  Heart,
  House,
  Layers,
  LayoutGrid,
  Leaf,
  Music,
  Orbit,
  Palette,
  Rocket,
  Star,
  Terminal,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { MenuEntry } from '@/app/rows/RowMenu';
import type { SpaceIcon } from '@/model/types';
import styles from './spaces.module.css';

/** Symbol icons for spaces; the first five match Arc's planet, grid, code, layers and cloud. */
export const SYMBOLS: Record<string, LucideIcon> = {
  planet: Orbit,
  grid: LayoutGrid,
  code: Code,
  layers: Layers,
  cloud: Cloud,
  briefcase: Briefcase,
  house: House,
  star: Star,
  heart: Heart,
  bolt: Zap,
  book: BookOpen,
  music: Music,
  camera: Camera,
  coffee: Coffee,
  globe: Globe,
  rocket: Rocket,
  flame: Flame,
  leaf: Leaf,
  palette: Palette,
  terminal: Terminal,
};

export const EMOJIS = ['🏠', '💼', '🚀', '🎨', '📚', '🎵', '⭐️', '🔥', '🌱', '🧪', '☕️', '🎮'];

const titleCase = (name: string) => name[0]!.toUpperCase() + name.slice(1);

export function iconMenu(
  current: SpaceIcon | undefined,
  choose: (icon: SpaceIcon | null) => void,
): MenuEntry[] {
  return [
    {
      label: 'Symbol',
      submenu: Object.entries(SYMBOLS).map(([name, Symbol]) => ({
        label: titleCase(name),
        icon: <Symbol size={14} strokeWidth={1.75} />,
        onSelect: () => choose({ type: 'symbol', name }),
      })),
    },
    {
      label: 'Emoji',
      submenu: EMOJIS.map((char) => ({
        label: char,
        onSelect: () => choose({ type: 'emoji', char }),
      })),
    },
    ...(current ? [{ label: 'Remove Icon', onSelect: () => choose(null) }] : []),
  ];
}

/** A space's icon: its emoji or symbol, or a small dot when it has none (as in Arc). */
export function SpaceGlyph({ icon, size = 16 }: { icon?: SpaceIcon; size?: number }) {
  if (icon?.type === 'emoji') {
    return (
      <span className={styles.emoji} style={{ fontSize: size - 3 }} aria-hidden>
        {icon.char}
      </span>
    );
  }
  const Symbol = icon?.type === 'symbol' ? SYMBOLS[icon.name] : undefined;
  if (Symbol) return <Symbol size={size} strokeWidth={1.75} aria-hidden />;
  return <span className={styles.dot} aria-hidden />;
}
