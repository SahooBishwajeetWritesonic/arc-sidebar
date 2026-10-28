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
