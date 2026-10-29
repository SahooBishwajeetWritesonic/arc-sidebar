import type { ReactNode } from 'react';
import styles from './icon-swap.module.css';

/**
 * Two icons (or words) that morph into each other as `on` changes. CSS transitions,
 * so a quick change back reverses smoothly from where it is.
 */
export function IconSwap({ on, off, to }: { on: boolean; off: ReactNode; to: ReactNode }) {
  return (
    <span className={styles.swap} data-on={on || undefined}>
      <span className={styles.off} aria-hidden={on || undefined}>
        {off}
      </span>
      <span className={styles.to} aria-hidden={!on || undefined}>
        {to}
      </span>
    </span>
  );
}
