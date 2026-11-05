import { rankHistory } from '@/command/history';
import type { HistoryEntry } from '@/platform/types';

const DAY = 86_400_000;
/** What stays quick to search on every key. */
const KEEP = { days: 90, pages: 10_000 };

export interface HistorySource {
  recent(since: number, max: number): Promise<HistoryEntry[]>;
  /** Chrome's own search: reaches older pages, but only by words as typed. */
  search(text: string, max: number): Promise<HistoryEntry[]>;
}

/**
 * Recent history in memory, so the command bar can match it fuzzily. Loaded on first search
 * (the worker forgets it when it sleeps), then kept current from history events.
 */
export class HistoryIndex {
  private pages: Map<string, HistoryEntry> | null = null;
  private loading: Promise<Map<string, HistoryEntry>> | null = null;
  /** Changes that arrive while loading. */
  private pending: ((pages: Map<string, HistoryEntry>) => void)[] = [];

  constructor(
    private readonly source: HistorySource,
    private readonly now = () => Date.now(),
  ) {}

  /** With no text: addresses typed before, for inline completion. */
  async search(text: string, limit: number): Promise<HistoryEntry[]> {
    const query = text.trim();
    const [pages, older] = await Promise.all([
      this.load().catch(() => new Map<string, HistoryEntry>()),
      query ? this.source.search(query, limit).catch(() => []) : [],
    ]);
    if (!query) {
      return [...pages.values()]
        .filter((page) => page.typedCount > 0)
        .sort((a, b) => b.typedCount - a.typedCount)
        .slice(0, limit);
    }
    const all = [...pages.values(), ...older.filter((page) => !pages.has(page.url))];
    return rankHistory(all, query, this.now(), limit);
  }

  visited(page: HistoryEntry) {
    this.change((pages) => pages.set(page.url, page));
  }

  removed(urls: readonly string[] | 'all') {
    this.change((pages) => {
      if (urls === 'all') pages.clear();
      else for (const url of urls) pages.delete(url);
    });
  }

  private change(apply: (pages: Map<string, HistoryEntry>) => void) {
    if (this.pages) apply(this.pages);
    else if (this.loading) this.pending.push(apply);
  }

  private load(): Promise<Map<string, HistoryEntry>> {
    if (this.pages) return Promise.resolve(this.pages);
    this.loading ??= this.source.recent(this.now() - KEEP.days * DAY, KEEP.pages).then(
      (list) => {
        const pages = new Map(list.map((page) => [page.url, page]));
        for (const apply of this.pending.splice(0)) apply(pages);
        this.pages = pages;
        this.loading = null;
        return pages;
      },
      (error: unknown) => {
        this.pending = [];
        this.loading = null;
        throw error;
      },
    );
    return this.loading;
  }
}
