import { browser } from 'wxt/browser';
import type { Synced } from '@/model/sync';
import { syncStateItem } from '@/platform/storage-items';
import type { SyncStore } from './service';

/**
 * Chrome syncs at most 8 KB an item and 100 KB in all, so the copy goes gzipped, in parts.
 * The note is written with them, but parts can arrive on another computer one by one.
 */
const PART = 7_000;
const TOO_BIG = 90_000;
const NOTE = 'sync.note';
const partKey = (i: number) => `sync.${i}`;

interface Note {
  version: 1;
  parts: number;
  length: number;
}

export const chromeSyncStore: SyncStore = {
  async read() {
    const all = await browser.storage.sync.get(null);
    const note = all[NOTE] as Note | undefined;
    if (!note) return null;
    if (note.version !== 1) throw new Error('The synced copy is from a newer version');
    const text = Array.from({ length: note.parts }, (_, i) => all[partKey(i)] ?? '').join('');
    if (text.length !== note.length) return undefined;
    // gzip checks itself, so parts from two different writes can't pass as one.
    const copy = (await unpack(text)) as Partial<Synced> | null;
    if (!Array.isArray(copy?.spaces) || typeof copy.items !== 'object' || !copy.items) {
      throw new Error('The synced copy can’t be read');
    }
    return { spaces: copy.spaces, items: copy.items };
  },

  async write(copy) {
    const text = await pack(copy);
    if (text.length > TOO_BIG) throw new Error('Too much to sync: over Chrome’s 100 KB');
    const parts = Math.max(1, Math.ceil(text.length / PART));
    const note: Note = { version: 1, parts, length: text.length };
    const values = Object.fromEntries(
      Array.from({ length: parts }, (_, i) => [partKey(i), text.slice(i * PART, (i + 1) * PART)]),
    );
    await browser.storage.sync.set({ ...values, [NOTE]: note });
    const stale = Object.keys(await browser.storage.sync.get(null)).filter((key) => {
      const index = /^sync\.(\d+)$/.exec(key)?.[1];
      return index !== undefined && Number(index) >= parts;
    });
    if (stale.length) await browser.storage.sync.remove(stale);
  },

  loadState: () => syncStateItem.getValue(),
  saveState: (state) => syncStateItem.setValue(state),
};

async function pack(value: unknown): Promise<string> {
  const zipped = new Blob([JSON.stringify(value)])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));
  const bytes = new Uint8Array(await new Response(zipped).arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function unpack(text: string): Promise<unknown> {
  const bytes = Uint8Array.from(atob(text), (char) => char.charCodeAt(0));
  const unzipped = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(unzipped).text());
}
