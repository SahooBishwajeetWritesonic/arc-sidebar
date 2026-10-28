import { ChevronLeft, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { forgetArchived, restoreArchived } from '@/app/actions';
import { Favicon } from '@/app/rows/Favicon';
import rows from '@/app/rows/rows.module.css';
import type { ArchiveEntry } from '@/model/types';
import { useSidebar } from '@/state/sidebar';
import { showView } from '@/state/ui';
import styles from './archive.module.css';

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const date = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'short',
  day: 'numeric',
});

function dayLabel(timestamp: number, now: Date): string {
  const day = new Date(timestamp).toDateString();
  if (day === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (day === yesterday.toDateString()) return 'Yesterday';
  return date.format(timestamp);
}

export function ArchiveView() {
  const entries = useSidebar((state) => state.archive.entries);
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const now = new Date();
    const out: { label: string; entries: ArchiveEntry[] }[] = [];
    for (const entry of entries) {
      if (needle && !`${entry.title} ${entry.url}`.toLowerCase().includes(needle)) continue;
      const label = dayLabel(entry.archivedAt, now);
      const group = out.at(-1);
      if (group?.label === label) group.entries.push(entry);
      else out.push({ label, entries: [entry] });
    }
    return out;
  }, [entries, query]);

  return (
    <section aria-label="Archive" className={styles.archive}>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.back}
          aria-label="Back to sidebar"
          onClick={() => showView('sidebar')}
        >
          <ChevronLeft size={16} strokeWidth={2} />
        </button>
        <h1 className={styles.heading}>Archive</h1>
      </header>
      <input
        className={styles.search}
        type="search"
        placeholder="Search archived tabs"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Search archived tabs"
      />

      {groups.length === 0 && (
        <p className={styles.empty}>
          {query
            ? 'Nothing archived matches that.'
            : 'Tabs you close, clear, or that auto-archive show up here.'}
        </p>
      )}

      {groups.map((group) => (
        <div key={group.label} className={styles.group}>
          <h2 className={styles.day}>{group.label}</h2>
          <ul className={rows.list}>
            {group.entries.map((entry) => (
              <li
                key={entry.id}
                className={rows.row}
                data-archive-entry={entry.id}
                onClick={() => restoreArchived([entry.id])}
              >
                <div className={rows.plate}>
                  <Favicon url={entry.url} />
                  <span className={rows.title}>{entry.title}</span>
                  <span className={styles.time}>{time.format(entry.archivedAt)}</span>
                  <button
                    type="button"
                    className={`${rows.accessory} ${rows.close}`}
                    aria-label="Remove from archive"
                    onClick={(event) => {
                      event.stopPropagation();
                      forgetArchived([entry.id]);
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
