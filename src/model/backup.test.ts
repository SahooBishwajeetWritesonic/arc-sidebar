import { generateNKeysBetween } from 'fractional-indexing';
import { describe, expect, it } from 'vitest';
import {
  NotSidebarExportError,
  parseExportFile,
  repairModel,
  sameSidebar,
  toExportFile,
} from './backup';
import {
  defaultSettings,
  emptyModel,
  FAVORITES_ID,
  FAVORITES_LIMIT,
  type Item,
  type SidebarModel,
} from './types';

const pin = (id: string, extra: Partial<Item> = {}): Item =>
  ({
    kind: 'pin',
    id,
    spaceId: 'default',
    parentId: null,
    order: 'a0',
    url: `https://${id}.com/`,
    title: id,
    ...extra,
  }) as Item;

const folder = (id: string, extra: Partial<Item> = {}): Item =>
  ({
    kind: 'folder',
    id,
    spaceId: 'default',
    parentId: null,
    order: 'a1',
    name: id,
    collapsed: false,
    ...extra,
  }) as Item;

const withItems = (...items: Item[]): SidebarModel => ({
  ...emptyModel(),
  items: Object.fromEntries(items.map((item) => [item.id, item])),
});

describe('repairModel', () => {
  it('keeps a sound model as it is', () => {
    const model: SidebarModel = {
      ...withItems(folder('f'), pin('p', { parentId: 'f' })),
      spaces: [
        {
          id: 'default',
          name: 'Work',
          icon: { type: 'emoji', char: '🧪' },
          theme: { colors: ['#ff8800'], harmony: 'single', intensity: 0.5, grain: 0.25 },
        },
      ],
      settings: {
        archiveAfter: '7d',
        appearance: 'dark',
        githubFolder: false,
        developerSites: ['localhost', 'app.example.com'],
        navButtons: true,
        routes: [{ id: 'r1', match: 'contains', text: 'figma.com', spaceId: 'default' }],
        sync: true,
      },
    };
    expect(repairModel(structuredClone(model))).toEqual(model);
  });

  it('keeps a Live Folder, its filters and its pull requests', () => {
    const model = withItems(
      folder('f', {
        live: {
          source: 'github',
          filters: { createdByMe: true, reviewRequests: false, drafts: false, repos: ['acme/app'] },
          filledFor: '[true,false,false,["acme/app"]]',
        },
      } as Partial<Item>),
      pin('p', {
        parentId: 'f',
        live: { repo: 'acme/app', number: 7, draft: true, created: '2026-10-01T00:00:00Z' },
      } as Partial<Item>),
    );
    expect(repairModel(structuredClone(model))).toEqual(model);
  });

  it('finds no sidebar without a space', () => {
    expect(repairModel(null)).toBeNull();
    expect(repairModel({ spaces: [], items: {} })).toBeNull();
    expect(repairModel({ spaces: [{ id: 'favorites', name: 'x' }], items: {} })).toBeNull();
  });

  it('drops items it cannot place and moves broken parents to the top', () => {
    const model = repairModel(
      withItems(
        pin('lost', { spaceId: 'gone' }),
        pin('orphan', { parentId: 'missing' }),
        pin('underPin', { parentId: 'orphan' }),
        folder('favFolder', { spaceId: FAVORITES_ID }),
        { id: 'half', kind: 'pin' } as Item,
      ),
    )!;
    expect(Object.keys(model.items).sort()).toEqual(['orphan', 'underPin']);
    expect(model.items.orphan!.parentId).toBeNull();
    expect(model.items.underPin!.parentId).toBeNull();
  });

  it('breaks a folder loop', () => {
    const model = repairModel(
      withItems(folder('a', { parentId: 'b' }), folder('b', { parentId: 'a' })),
    )!;
    const roots = Object.values(model.items).filter((item) => item.parentId === null);
    expect(roots).toHaveLength(1);
  });

  it('keeps Favorites within the limit, in order', () => {
    const keys = generateNKeysBetween(null, null, FAVORITES_LIMIT + 2);
    const favorites = keys.map((order, i) => pin(`f${i}`, { spaceId: FAVORITES_ID, order }));
    const model = repairModel(withItems(...favorites))!;
    expect(Object.keys(model.items)).toHaveLength(FAVORITES_LIMIT);
    expect(model.items.f13).toBeUndefined();
  });

  it('remakes order keys the sidebar cannot use', () => {
    const model = repairModel(withItems(pin('a', { order: 'a0' }), pin('b', { order: '!!' })))!;
    expect(model.items.b!.order > model.items.a!.order).toBe(true);
  });

  it('fills in settings and drops broken themes and icons', () => {
    const model = repairModel({
      spaces: [{ id: 's', name: 'S', icon: { type: 'emoji' }, theme: { colors: ['red'] } }],
      items: {},
      settings: { archiveAfter: 'forever' },
    })!;
    expect(model.spaces).toEqual([{ id: 's', name: 'S' }]);
    expect(model.settings).toEqual(defaultSettings());
  });
});

describe('export files', () => {
  it('reads back what Export Sidebar writes', () => {
    const model = withItems(pin('p'));
    const file = JSON.parse(JSON.stringify(toExportFile(model, new Date(0))));
    expect(parseExportFile(file)).toEqual(model);
  });

  it('rejects other files', () => {
    expect(() => parseExportFile({ sidebar: {} })).toThrow(NotSidebarExportError);
    expect(() => parseExportFile({ app: 'arc-sidebar', format: 1, model: {} })).toThrow(
      NotSidebarExportError,
    );
  });
});

describe('sameSidebar', () => {
  it('ignores revisions, key order and missing optional fields', () => {
    const model = withItems(pin('p'), folder('f'));
    const reordered: SidebarModel = {
      settings: model.settings,
      items: { f: model.items.f!, p: { ...model.items.p!, customTitle: undefined } as Item },
      spaces: model.spaces,
      rev: 9,
    };
    expect(sameSidebar(model, reordered)).toBe(true);
    expect(sameSidebar(model, withItems(pin('p')))).toBe(false);
    expect(
      sameSidebar(model, { ...model, settings: { ...model.settings, appearance: 'dark' } }),
    ).toBe(false);
  });
});
