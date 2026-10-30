import { describe, expect, it } from 'vitest';
import { applyIntent } from './reducer';
import { mergeSynced, syncedPart, withSynced, type Synced } from './sync';
import { FAVORITES_ID, emptyModel, type Intent, type Item, type SidebarModel } from './types';

const S = 'default';

function build(...intents: Intent[]): SidebarModel {
  return intents.reduce((next, intent) => applyIntent(next, intent), emptyModel());
}

const pin = (itemId: string, order: string, spaceId = S): Intent => ({
  type: 'pinTab',
  itemId,
  tabId: Number(itemId.replace(/\D/g, '')),
  spaceId,
  parentId: null,
  order,
  url: `https://example.com/${itemId}`,
  title: itemId,
});

const part = (...items: Item[]): Synced => ({
  spaces: [{ id: S, name: 'Space' }],
  items: Object.fromEntries(items.map((item) => [item.id, item])),
});

const model = build(pin('p1', 'a0'), pin('p2', 'a1'), pin('f3', 'a0', FAVORITES_ID));
const [p1, p2] = [model.items.p1!, model.items.p2!];

describe('syncedPart and withSynced', () => {
  it('leaves Favorites and settings on this computer', () => {
    expect(Object.keys(syncedPart(model).items)).toEqual(['p1', 'p2']);
    const replaced = withSynced(
      { ...model, settings: { ...model.settings, navButtons: true } },
      part(p2),
    );
    expect(Object.keys(replaced!.items).sort()).toEqual(['f3', 'p2']);
    expect(replaced!.settings.navButtons).toBe(true);
  });

  it('moves a pin out of a folder that went, and drops one whose space went', () => {
    const inFolder = { ...p1, parentId: 'gone' };
    const elsewhere = { ...p2, spaceId: 'gone' };
    const replaced = withSynced(model, part(inFolder, elsewhere));
    expect(replaced!.items.p1).toMatchObject({ parentId: null });
    expect(replaced!.items.p2).toBeUndefined();
  });
});

describe('mergeSynced', () => {
  const renamed = { ...p1, customTitle: 'Mine' } as Item;
  const renamedThere = { ...p1, customTitle: 'Theirs' } as Item;

  it('takes each side’s own changes: an edit, an addition, a removal', () => {
    const base = part(p1, p2);
    const p4 = { ...p2, id: 'p4' };
    expect(mergeSynced(base, part(renamed, p2), part(p1, p2, p4))).toEqual(part(renamed, p2, p4));
    expect(mergeSynced(base, part(p1, p2), part(p1))).toEqual(part(p1));
    expect(mergeSynced(base, part(p1), part(p1, p2))).toEqual(part(p1));
  });

  it('lets the other computer’s edit win, but an edit beats a removal', () => {
    const base = part(p1);
    expect(mergeSynced(base, part(renamed), part(renamedThere))).toEqual(part(renamedThere));
    expect(mergeSynced(base, part(renamed), part())).toEqual(part(renamed));
    expect(mergeSynced(base, part(), part(renamedThere))).toEqual(part(renamedThere));
  });

  it('keeps everything from both when sync has just been turned on', () => {
    expect(mergeSynced(null, part(p1), part(p2))).toEqual(part(p1, p2));
  });

  it('keeps the spaces’ order from whichever side changed it', () => {
    const a = { id: 'a', name: 'A' };
    const b = { id: 'b', name: 'B' };
    const c = { id: 'c', name: 'C' };
    const base = { spaces: [a, b], items: {} };
    expect(mergeSynced(base, { spaces: [a, b], items: {} }, { spaces: [b, a], items: {} })).toEqual(
      { spaces: [b, a], items: {} },
    );
    expect(
      mergeSynced(base, { spaces: [b, a, c], items: {} }, { spaces: [a, b], items: {} }),
    ).toEqual({ spaces: [b, a, c], items: {} });
  });
});
