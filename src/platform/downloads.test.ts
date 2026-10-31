import { describe, expect, it } from 'vitest';
import { downloadStatus, fileName, formatBytes, type DownloadEntry } from './downloads';

const entry = (patch: Partial<DownloadEntry>): DownloadEntry => ({
  id: 1,
  name: 'roadmap.pdf',
  url: 'https://www.example.com/files/roadmap.pdf',
  state: 'complete',
  received: 2_400_000,
  total: 2_400_000,
  startedAt: 0,
  exists: true,
  paused: false,
  ...patch,
});

describe('downloads', () => {
  it('sizes files as Finder does', () => {
    expect(formatBytes(512)).toBe('512 bytes');
    expect(formatBytes(812_000)).toBe('812 KB');
    expect(formatBytes(2_400_000)).toBe('2.4 MB');
    expect(formatBytes(48_000_000)).toBe('48 MB');
  });

  it('names a file from its path on any system', () => {
    expect(fileName('/Users/me/Downloads/a b.zip')).toBe('a b.zip');
    expect(fileName('C:\\Users\\me\\Downloads\\x.pdf')).toBe('x.pdf');
  });

  it('says how far along it is, or what became of it', () => {
    expect(downloadStatus(entry({}))).toBe('2.4 MB · example.com');
    expect(
      downloadStatus(entry({ state: 'in_progress', received: 19_200_000, total: 48_000_000 })),
    ).toBe('40% · 19 MB of 48 MB');
    expect(downloadStatus(entry({ state: 'in_progress', total: 0, paused: true }))).toBe(
      'Paused · 2.4 MB',
    );
    expect(downloadStatus(entry({ state: 'interrupted', error: 'USER_CANCELED' }))).toBe(
      'Cancelled · example.com',
    );
    expect(downloadStatus(entry({ state: 'interrupted', error: 'NETWORK_FAILED' }))).toBe(
      'Failed · example.com',
    );
    expect(downloadStatus(entry({ exists: false }))).toBe('Deleted · example.com');
  });
});
