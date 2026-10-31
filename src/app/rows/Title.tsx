import { Tooltip } from '@base-ui/react/tooltip';
import { useLayoutEffect, useRef, useState } from 'react';
import { isDeveloperSite } from '@/model/urls';
import { useSidebar } from '@/state/sidebar';
import styles from './rows.module.css';

/** One tooltip for every title, so moving between rows hands it over at once. */
export const titleTooltip = Tooltip.createHandle<string>();

const isCut = (title: Element) =>
  [title, ...title.children].some((part) => part.scrollWidth > part.clientWidth);

// One observer for every title: a row's accessories showing on hover can cut its title.
const recheck = new WeakMap<Element, () => void>();
const resized =
  typeof ResizeObserver === 'undefined'
    ? null
    : new ResizeObserver((entries) => entries.forEach((entry) => recheck.get(entry.target)?.()));

function useCut(text: string) {
  const ref = useRef<HTMLSpanElement>(null);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const title = ref.current;
    if (!title) return;
    const check = () => setCut(isCut(title));
    check();
    recheck.set(title, check);
    resized?.observe(title);
    return () => {
      resized?.unobserve(title);
      recheck.delete(title);
    };
  }, [text]);
  return [ref, cut] as const;
}

/** `subtitle` is Developer Mode's host. */
export function Title({
  text,
  subtitle,
  className = '',
}: {
  text: string;
  subtitle?: string;
  className?: string;
}) {
  const [ref, cut] = useCut(text);
  if (!subtitle) {
    return (
      <Tooltip.Trigger
        handle={titleTooltip}
        payload={text}
        delay={TOOLTIP_DELAY_MS}
        disabled={!cut}
        render={<span ref={ref} className={`${styles.title} ${className}`} dir="auto" data-title />}
      >
        {text}
      </Tooltip.Trigger>
    );
  }
  return (
    <Tooltip.Trigger
      handle={titleTooltip}
      payload={text}
      delay={TOOLTIP_DELAY_MS}
      disabled={!cut}
      render={
        <span ref={ref} className={`${styles.title} ${styles.twoLines} ${className}`} data-title />
      }
    >
      <span dir="auto">{text}</span>
      <span className={styles.subtitle}>{subtitle}</span>
    </Tooltip.Trigger>
  );
}

const TOOLTIP_DELAY_MS = 500;

/** Arc's Developer Mode shows a tab's site under its title, with the port for local servers. */
export function useDeveloperHost(url: string): string | undefined {
  return useSidebar((state) =>
    isDeveloperSite(state.model.settings.developerSites, url) ? new URL(url).host : undefined,
  );
}
