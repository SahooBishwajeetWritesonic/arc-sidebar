export interface DownloadEntry {
  id: number;
  name: string;
  url: string;
  state: 'in_progress' | 'interrupted' | 'complete';
  received: number;
  /** 0 when the site didn't say. */
  total: number;
  startedAt: number;
  /** False once the file was moved or deleted. */
  exists: boolean;
  paused: boolean;
  /** Chrome's reason, for an interrupted one (USER_CANCELED, NETWORK_FAILED…). */
  error?: string;
}

export const fileName = (path: string) => path.split(/[\\/]/).pop() || path;

const UNITS = ['KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes: number): string {
  if (bytes < 1000) return `${bytes} bytes`;
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${UNITS[unit]}`;
}

function host(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function downloadStatus(entry: DownloadEntry): string {
  const site = host(entry.url);
  const withSite = (text: string) => (site ? `${text} · ${site}` : text);
  if (entry.state === 'in_progress') {
    const done = formatBytes(entry.received);
    if (!entry.total) return entry.paused ? `Paused · ${done}` : done;
    const percent = Math.floor((entry.received / entry.total) * 100);
    const text = `${percent}% · ${done} of ${formatBytes(entry.total)}`;
    return entry.paused ? `Paused · ${text}` : text;
  }
  if (entry.state === 'interrupted') {
    return withSite(entry.error === 'USER_CANCELED' ? 'Cancelled' : 'Failed');
  }
  if (!entry.exists) return withSite('Deleted');
  return withSite(formatBytes(entry.total || entry.received));
}
