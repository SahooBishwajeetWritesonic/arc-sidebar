import { motion, useTransform } from 'motion/react';
import { useMemo } from 'react';
import { pagerWidth, pagerX, pageVisibility } from '@/app/spaces/pager';
import { useSidebar } from '@/state/sidebar';
import type { ThemeLook } from './engine';
import { grainTile } from './grain';
import styles from './backdrop.module.css';

/**
 * Every space's background, stacked; each layer's opacity follows its page's visibility, so
 * themes cross-fade with a swipe (CSS can't animate between gradients; Zen does this too).
 */
export function Backdrop({ looks }: { looks: Record<string, ThemeLook> }) {
  const spaces = useSidebar((state) => state.model.spaces);
  const grain = useMemo(grainTile, []);
  return (
    <div className={styles.backdrop} aria-hidden>
      {spaces.map((space, index) => {
        const look = looks[space.id];
        return look ? <Layer key={space.id} index={index} look={look} grain={grain} /> : null;
      })}
    </div>
  );
}

function Layer({ index, look, grain }: { index: number; look: ThemeLook; grain: string }) {
  const opacity = useTransform([pagerX, pagerWidth], ([x, width]: number[]) =>
    pageVisibility(x!, width!, index),
  );
  return (
    <motion.div className={styles.layer} style={{ opacity, background: look.background }}>
      {look.grain > 0 && (
        <div
          className={styles.grain}
          style={{ backgroundImage: grain, opacity: look.grain * 0.14 }}
        />
      )}
    </motion.div>
  );
}
