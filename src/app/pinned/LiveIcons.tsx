import type { LivePin } from '@/model/types';
import styles from './live-icons.module.css';

/** A pull request's checks: a tick when they pass, a cross when they fail. */
export function CiBadge({ state }: { state: NonNullable<LivePin['ci']> }) {
  return (
    <svg
      className={styles.badge}
      data-state={state}
      width="10"
      height="10"
      viewBox="0 0 10 10"
      role="img"
      aria-label={state === 'success' ? 'Checks passed' : 'Checks failed'}
    >
      <circle cx="5" cy="5" r="4.6" />
      <path
        d={state === 'success' ? 'M2.9 5.2 4.3 6.6 7.1 3.7' : 'M3.4 3.4 6.6 6.6M6.6 3.4 3.4 6.6'}
      />
    </svg>
  );
}
