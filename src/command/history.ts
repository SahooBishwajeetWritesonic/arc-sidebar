import type { HistoryEntry } from '@/platform/types';
import { ranked } from './match';
import { displayUrl } from './url';

const DAY = 86_400_000;

/** Firefox's frecency, from what Chrome keeps: visits, typed ones double, faded by age. */
export function frecency(entry: HistoryEntry, now: number): number {
  const days = (now - entry.lastVisitTime) / DAY;
  const recency = days < 4 ? 1 : days < 14 ? 0.7 : days < 31 ? 0.5 : days < 90 ? 0.3 : 0.1;
  return (entry.visitCount + 2 * entry.typedCount) * recency;
}

/** Capped at 1.5, so frecency moves a page up one match tier at most. */
export const historyBonus = (entry: HistoryEntry, now: number) =>
  Math.min(1.5, Math.log10(1 + frecency(entry, now)) / 2);

export const pageText = (entry: HistoryEntry) => `${entry.title} ${displayUrl(entry.url)}`;

export function rankHistory(
  entries: readonly HistoryEntry[],
  query: string,
  now: number,
  limit: number,
): HistoryEntry[] {
  return ranked(
    entries.map((entry) => ({ entry, text: pageText(entry) })),
    query,
    { bonus: ({ entry }) => historyBonus(entry, now) },
  )
    .slice(0, limit)
    .map(({ item }) => item.entry);
}
