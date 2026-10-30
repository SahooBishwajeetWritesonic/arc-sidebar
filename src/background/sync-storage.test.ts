import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Item } from '@/model/types';

const synced = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock('wxt/browser', () => ({
  browser: {
    storage: {
      sync: {
        get: async () => structuredClone(synced.data),
        set: async (values: Record<string, unknown>) => void Object.assign(synced.data, values),
        remove: async (keys: string[]) => keys.forEach((key) => delete synced.data[key]),
      },
    },
  },
}));
vi.mock('@/platform/storage-items', () => ({ syncStateItem: {} }));

const { chromeSyncStore } = await import('./sync-storage');

/** Pins with addresses that don't compress away, so the copy needs several parts. */
function copyOf(count: number) {
  const items: Record<string, Item> = {};
  for (let i = 0; i < count; i++) {
    const id = `${i}-${Math.random().toString(36).slice(2)}`;
    items[id] = {
      id,
      kind: 'pin',
      spaceId: 'default',
      parentId: null,
      order: `a${i}`,
      url: `https://example.com/${Math.random().toString(36).repeat(3)}`,
      title: Math.random().toString(36),
    };
  }
  return { spaces: [{ id: 'default', name: 'Space' }], items };
}

const parts = () => Object.keys(synced.data).filter((key) => /^sync\.\d+$/.test(key)).length;

describe('chromeSyncStore', () => {
  beforeEach(() => {
    synced.data = {};
  });

  it('has nothing to read before anything is written', async () => {
    expect(await chromeSyncStore.read()).toBeNull();
  });

  it('writes the copy in parts and reads it back; a smaller one leaves no stale parts', async () => {
    const big = copyOf(300);
    await chromeSyncStore.write(big);
    expect(parts()).toBeGreaterThan(1);
    expect(await chromeSyncStore.read()).toEqual(big);

    const small = copyOf(2);
    await chromeSyncStore.write(small);
    expect(parts()).toBe(1);
    expect(await chromeSyncStore.read()).toEqual(small);
  });

  it('waits for a copy whose parts haven’t all arrived', async () => {
    await chromeSyncStore.write(copyOf(300));
    delete synced.data['sync.1'];
    expect(await chromeSyncStore.read()).toBeUndefined();
  });

  it('refuses a copy too big for Chrome', async () => {
    await expect(chromeSyncStore.write(copyOf(2000))).rejects.toThrow('Too much to sync');
    expect(synced.data).toEqual({});
  });
});
