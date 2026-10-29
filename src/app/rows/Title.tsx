import type { PointerEvent } from 'react';
import { isDeveloperSite } from '@/model/urls';
import { useSidebar } from '@/state/sidebar';
import styles from './rows.module.css';

/**
 * One line, faded at its end; the text sets its own direction. The full title shows
 * as a tooltip only when it's cut off. `subtitle` is Developer Mode's host.
 */
export function Title({
  text,
  subtitle,
  className = '',
}: {
  text: string;
  subtitle?: string;
  className?: string;
}) {
  const tooltipIfCut = (event: PointerEvent<HTMLSpanElement>) => {
    const span = event.currentTarget;
    span.title = span.scrollWidth > span.clientWidth ? text : '';
  };
  if (!subtitle) {
    return (
      <span className={`${styles.title} ${className}`} dir="auto" onPointerEnter={tooltipIfCut}>
        {text}
      </span>
    );
  }
  return (
    <span
      className={`${styles.title} ${styles.twoLines} ${className}`}
      onPointerEnter={tooltipIfCut}
    >
      <span dir="auto">{text}</span>
      <span className={styles.subtitle}>{subtitle}</span>
    </span>
  );
}

/** Arc's Developer Mode shows a tab's site under its title, with the port for local servers. */
export function useDeveloperHost(url: string): string | undefined {
  return useSidebar((state) =>
    isDeveloperSite(state.model.settings.developerSites, url) ? new URL(url).host : undefined,
  );
}
