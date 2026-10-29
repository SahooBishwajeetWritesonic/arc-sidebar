import type { PointerEvent } from 'react';
import styles from './rows.module.css';

/**
 * One line, faded at its end. The text sets its own direction (Arabic and Hebrew read
 * right to left); the full title shows as a tooltip only when it's cut off.
 */
export function Title({ text, className = '' }: { text: string; className?: string }) {
  const tooltipIfCut = (event: PointerEvent<HTMLSpanElement>) => {
    const span = event.currentTarget;
    span.title = span.scrollWidth > span.clientWidth ? text : '';
  };
  return (
    <span className={`${styles.title} ${className}`} dir="auto" onPointerEnter={tooltipIfCut}>
      {text}
    </span>
  );
}
