import { Menu } from '@base-ui/react/menu';
import {
  Ellipsis,
  File,
  FileArchive,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  FolderOpen,
  Package,
  Search,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import list from '@/app/archive/archive.module.css';
import { byDay } from '@/app/library/days';
import menu from '@/app/rows/menu.module.css';
import rows from '@/app/rows/rows.module.css';
import { Title } from '@/app/rows/Title';
import { downloadStatus, type DownloadEntry } from '@/platform/downloads';
import {
  cancelDownload,
  eraseDownloads,
  loadDownloadIcon,
  loadDownloads,
  openDownload,
  showDownload,
  showDownloadsFolder,
  watchDownloads,
} from '@/state/downloads';
import styles from './downloads.module.css';

/** Chrome reports progress only when asked, so it's asked this often while one comes in. */
const PROGRESS_MS = 500;

function useDownloads() {
  const [downloads, setDownloads] = useState<DownloadEntry[] | null>(null);
  useEffect(() => {
    let current = true;
    const refresh = () => void loadDownloads().then((found) => current && setDownloads(found));
    refresh();
    const off = watchDownloads(refresh);
    return () => {
      current = false;
      off();
    };
  }, []);
  const coming = downloads?.some((entry) => entry.state === 'in_progress') ?? false;
  useEffect(() => {
    if (!coming) return;
    const timer = setInterval(
      () => void loadDownloads().then((found) => setDownloads(found)),
      PROGRESS_MS,
    );
    return () => clearInterval(timer);
  }, [coming]);
  return downloads;
}

export function DownloadsView() {
  const downloads = useDownloads();
  const [query, setQuery] = useState('');
  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const shown = (downloads ?? []).filter(
      (entry) => !needle || `${entry.name} ${entry.url}`.toLowerCase().includes(needle),
    );
    return byDay(shown, (entry) => entry.startedAt);
  }, [downloads, query]);
  const finished = (downloads ?? []).filter((entry) => entry.state !== 'in_progress');

  return (
    <section aria-label="Downloads" className={list.archive}>
      <div className={list.toolbar}>
        <label className={list.searchBox}>
          <Search className={list.searchIcon} size={14} strokeWidth={2} aria-hidden />
          <input
            className={list.search}
            type="search"
            placeholder="Search Downloads…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search downloads"
          />
        </label>
        <Menu.Root>
          <Menu.Trigger className={list.filter} aria-label="Downloads options">
            <Ellipsis size={14} strokeWidth={2} aria-hidden />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner className={menu.positioner} align="end" sideOffset={4}>
              <Menu.Popup className={menu.popup}>
                <Menu.Item className={menu.item} onClick={() => showDownloadsFolder()}>
                  Show Downloads Folder
                </Menu.Item>
                <Menu.Item
                  className={menu.item}
                  disabled={!finished.length}
                  onClick={() => eraseDownloads(finished.map((entry) => entry.id))}
                >
                  Clear List
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>

      {downloads && groups.length === 0 && (
        <p className={list.empty}>
          {query ? 'No downloads match that.' : 'Files you download show up here.'}
        </p>
      )}

      {groups.map((group) => (
        <div key={group.label} className={list.group}>
          <h2 className={list.day}>{group.label}</h2>
          <ul className={rows.list}>
            {group.items.map((entry) => (
              <DownloadRow key={entry.id} entry={entry} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function DownloadRow({ entry }: { entry: DownloadEntry }) {
  const coming = entry.state === 'in_progress';
  const opens = entry.state === 'complete' && entry.exists;
  const progress = coming && entry.total ? entry.received / entry.total : undefined;
  return (
    <li
      className={`${rows.row} ${list.entry}`}
      data-download={entry.id}
      data-unavailable={!opens && !coming ? '' : undefined}
      onClick={() => opens && openDownload(entry.id)}
    >
      <div className={rows.plate}>
        <FileIcon entry={entry} />
        <Title text={entry.name} subtitle={downloadStatus(entry)} />
        {coming ? (
          <button
            type="button"
            className={`${rows.accessory} ${rows.close}`}
            aria-label="Cancel download"
            onClick={(event) => {
              event.stopPropagation();
              cancelDownload(entry.id);
            }}
          >
            <X size={14} />
          </button>
        ) : (
          entry.exists && (
            <button
              type="button"
              className={`${rows.accessory} ${rows.close}`}
              aria-label="Show in Finder"
              onClick={(event) => {
                event.stopPropagation();
                showDownload(entry.id);
              }}
            >
              <FolderOpen size={14} />
            </button>
          )
        )}
        {progress !== undefined && (
          <span
            className={styles.progress}
            style={{ '--done': progress } as CSSProperties}
            role="progressbar"
            aria-label={`Downloading ${entry.name}`}
            aria-valuenow={Math.floor(progress * 100)}
          />
        )}
      </div>
    </li>
  );
}

const KINDS: [RegExp, typeof File][] = [
  [/\.(pdf|txt|md|docx?|rtf|pages|csv|xlsx?)$/i, FileText],
  [/\.(zip|rar|7z|gz|tgz|tar|bz2|xz)$/i, FileArchive],
  [/\.(png|jpe?g|gif|webp|svg|heic|avif|bmp|ico)$/i, FileImage],
  [/\.(mp4|mov|webm|mkv|avi|m4v)$/i, FileVideo],
  [/\.(mp3|wav|m4a|flac|aac|ogg)$/i, FileAudio],
  [/\.(dmg|pkg|exe|msi|app|deb|rpm|apk)$/i, Package],
];

/** Chrome's system icon for the type, else one by extension. */
function FileIcon({ entry }: { entry: DownloadEntry }) {
  const [icon, setIcon] = useState<string>();
  const ready = entry.state === 'complete';
  useEffect(() => {
    if (!ready) return;
    let current = true;
    void loadDownloadIcon(entry.id).then((found) => current && setIcon(found));
    return () => void (current = false);
  }, [entry.id, ready]);
  if (icon) return <img className={styles.icon} src={icon} alt="" draggable={false} />;
  const Kind = KINDS.find(([pattern]) => pattern.test(entry.name))?.[1] ?? File;
  return <Kind className={styles.icon} size={16} strokeWidth={1.75} aria-hidden />;
}
