import { Menu } from '@base-ui/react/menu';
import { Check, ListFilter, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { forgetArchived, restoreArchived } from '@/app/actions';
import { Favicon } from '@/app/rows/Favicon';
import menu from '@/app/rows/menu.module.css';
import rows from '@/app/rows/rows.module.css';
import { Title } from '@/app/rows/Title';
import { byDay } from '@/app/library/days';
import { useSidebar } from '@/state/sidebar';
import { setClearingArchive } from '@/state/ui';
import styles from './archive.module.css';

/** Arc's archive filters: by how a tab left Today, and by space. */
type How = 'all' | 'closed' | 'auto';
const HOW: { value: How; label: string }[] = [
  { value: 'all', label: 'All Tabs' },
  { value: 'closed', label: 'Closed' },
  { value: 'auto', label: 'Auto-Archived' },
];
const ALL_SPACES = '';

function shortUrl(url: string): string {
  try {
    const { host, pathname, search } = new URL(url);
    return `${host.replace(/^www\./, '')}${pathname === '/' ? '' : pathname}${search}`;
  } catch {
    return url;
  }
}

export function ArchiveView() {
  const entries = useSidebar((state) => state.archive.entries);
  const spaces = useSidebar((state) => state.model.spaces);
  const [query, setQuery] = useState('');
  const [how, setHow] = useState<How>('all');
  const [spaceId, setSpaceId] = useState(ALL_SPACES);
  const space = spaces.find((s) => s.id === spaceId);
  const filters = [space?.name, how !== 'all' && HOW.find((h) => h.value === how)?.label]
    .filter(Boolean)
    .join(' · ');

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const shown = entries.filter(
      (entry) =>
        (!needle || `${entry.title} ${entry.url}`.toLowerCase().includes(needle)) &&
        // Cleared counts as closed: you did it, not the timer.
        (how === 'all' || (entry.reason === 'auto') === (how === 'auto')) &&
        (spaceId === ALL_SPACES || entry.spaceId === spaceId),
    );
    return byDay(shown, (entry) => entry.archivedAt);
  }, [entries, query, how, spaceId]);

  return (
    <section aria-label="Archive" className={styles.archive}>
      <div className={styles.toolbar}>
        <label className={styles.searchBox}>
          <Search className={styles.searchIcon} size={14} strokeWidth={2} aria-hidden />
          <input
            className={styles.search}
            type="search"
            placeholder="Search Archive…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search archived tabs"
          />
        </label>
        <Menu.Root>
          <Menu.Trigger
            className={styles.filter}
            aria-label="Archive options"
            data-filtered={filters ? '' : undefined}
          >
            <ListFilter size={14} strokeWidth={2} aria-hidden />
            Filter
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner className={menu.positioner} align="end" sideOffset={4}>
              <Menu.Popup className={menu.popup}>
                <Menu.RadioGroup value={how} onValueChange={(value) => setHow(value as How)}>
                  {HOW.map((choice) => (
                    <Menu.RadioItem
                      key={choice.value}
                      value={choice.value}
                      className={menu.item}
                      closeOnClick
                    >
                      <Menu.RadioItemIndicator className={menu.check} keepMounted>
                        <Check size={12} strokeWidth={2.5} />
                      </Menu.RadioItemIndicator>
                      {choice.label}
                    </Menu.RadioItem>
                  ))}
                </Menu.RadioGroup>
                {spaces.length > 1 && (
                  <>
                    <Menu.Separator className={menu.separator} />
                    <Menu.RadioGroup
                      value={spaceId}
                      onValueChange={(value) => setSpaceId(value as string)}
                    >
                      {[{ id: ALL_SPACES, name: 'All Spaces' }, ...spaces].map((choice) => (
                        <Menu.RadioItem
                          key={choice.id}
                          value={choice.id}
                          className={menu.item}
                          closeOnClick
                        >
                          <Menu.RadioItemIndicator className={menu.check} keepMounted>
                            <Check size={12} strokeWidth={2.5} />
                          </Menu.RadioItemIndicator>
                          {choice.name}
                        </Menu.RadioItem>
                      ))}
                    </Menu.RadioGroup>
                  </>
                )}
                <Menu.Separator className={menu.separator} />
                <Menu.Item
                  className={menu.item}
                  disabled={!entries.length}
                  onClick={() => setClearingArchive(true)}
                >
                  <span className={menu.check} />
                  Clear Archive…
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
      {filters && <p className={styles.filters}>{filters}</p>}

      {groups.length === 0 && (
        <p className={styles.empty}>
          {query || filters
            ? 'Nothing archived matches that.'
            : 'Tabs you close, clear, or that auto-archive show up here.'}
        </p>
      )}

      {groups.map((group) => (
        <div key={group.label} className={styles.group}>
          <h2 className={styles.day}>{group.label}</h2>
          <ul className={rows.list}>
            {group.items.map((entry) => (
              <li
                key={entry.id}
                className={`${rows.row} ${styles.entry}`}
                data-archive-entry={entry.id}
                onClick={() => restoreArchived([entry.id])}
              >
                <div className={rows.plate}>
                  <Favicon url={entry.url} />
                  <Title text={entry.title} subtitle={shortUrl(entry.url)} />
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
