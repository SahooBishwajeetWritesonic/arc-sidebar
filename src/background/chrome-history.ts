import { browser, type Browser } from 'wxt/browser';
import type { HistoryEntry } from '@/platform/types';
import type { HistorySource } from './history';

export function toHistoryEntry(item: Browser.history.HistoryItem): HistoryEntry | null {
  if (!item.url) return null;
  return {
    url: item.url,
    title: item.title ?? '',
    visitCount: item.visitCount ?? 0,
    typedCount: item.typedCount ?? 0,
    lastVisitTime: item.lastVisitTime ?? 0,
  };
}

const entries = (items: Browser.history.HistoryItem[]) =>
  items.flatMap((item) => toHistoryEntry(item) ?? []);

export const chromeHistory: HistorySource = {
  recent: async (since, max) =>
    entries(await browser.history.search({ text: '', startTime: since, maxResults: max })),
  search: async (text, max) =>
    entries(await browser.history.search({ text, startTime: 0, maxResults: max })),
};
