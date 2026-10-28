import { describe, expect, it } from 'vitest';
import { applyIntent } from '@/model/reducer';
import { childrenOf } from '@/model/tree';
import {
  FAVORITES_ID,
  FAVORITES_LIMIT,
  emptyModel,
  type Intent,
  type SidebarModel,
} from '@/model/types';
import { parseArcSidebar } from './arc';
import fixture from './fixtures/arc-sidebar.json';
import { planImport, type ImportChoice } from './plan';

const arc = parseArcSidebar(fixture);
const all: ImportChoice = { spaceIds: arc.spaces.map((s) => s.id), favorites: true };

function ids() {
  let n = 0;
  return () => `id${n++}`;
}

function run(model: SidebarModel, choice: ImportChoice = all) {
  const plan = planImport(model, arc, choice, ids());
  return { plan, model: applyIntent(model, { type: 'importSidebar', ...plan }) };
}

const titles = (model: SidebarModel, spaceId: string, parentId: string | null = null) =>
  childrenOf(model, spaceId, parentId).map((item) =>
    item.kind === 'pin' ? (item.customTitle ?? item.title) : `[${item.name}]`,
  );

describe('planImport', () => {
  it('adds new spaces after the existing ones, with their icons', () => {
    const { model } = run(emptyModel());
    expect(model.spaces.map((s) => s.name)).toEqual(['Space', 'Work', 'Lab', 'Home', 'Misc']);
    expect(model.spaces[1]!.icon).toEqual({ type: 'symbol', name: 'planet' });
    expect(model.spaces[4]!.icon).toBeUndefined();
  });

  it('rebuilds the pinned tree in order, folders collapsed', () => {
    const { model } = run(emptyModel());
    const work = model.spaces[1]!.id;
    expect(titles(model, work)).toEqual(['Inbox', '[Docs]', '[Pull Requests]']);
    const docs = childrenOf(model, work, null)[1]!;
    expect(docs).toMatchObject({ kind: 'folder', collapsed: true });
    expect(titles(model, work, docs.id)).toEqual(['Spec', '[Old]']);
  });

  it('imports only the chosen spaces', () => {
    const { plan, model } = run(emptyModel(), { spaceIds: ['S-LAB'], favorites: false });
    expect(model.spaces.map((s) => s.name)).toEqual(['Space', 'Lab']);
    expect(plan.summary).toEqual({ 'S-LAB': { tabs: 2, folders: 0 } });
    expect(plan.favorites).toBe(0);
  });

  it('merges into a space with the same name, folder by folder, skipping pages already pinned', () => {
    let model = applyIntent(emptyModel(), {
      type: 'renameSpace',
      spaceId: 'default',
      name: 'work',
    });
    const intents: Intent[] = [
      {
        type: 'pinTab',
        itemId: 'mine',
        tabId: 1,
        spaceId: 'default',
        parentId: null,
        order: 'a0',
        url: 'https://mail.example.com/inbox#label/x',
        title: 'Mail',
      },
      {
        type: 'createFolder',
        itemId: 'docs',
        spaceId: 'default',
        parentId: null,
        order: 'a1',
        name: 'Docs',
      },
    ];
    model = intents.reduce(applyIntent, model);

    const result = run(model, { spaceIds: ['S-WORK'], favorites: false });
    expect(result.plan.spaces).toEqual([]);
    expect(result.plan.summary['S-WORK']).toEqual({ into: 'work', tabs: 3, folders: 2 });
    // Inbox was already pinned; Docs merged; Pull Requests is new.
    expect(titles(result.model, 'default')).toEqual(['Mail', '[Docs]', '[Pull Requests]']);
    expect(titles(result.model, 'default', 'docs')).toEqual(['Spec', '[Old]']);
  });

  it('adds nothing when the same file is imported again', () => {
    const first = run(emptyModel()).model;
    const again = run(first);
    expect(again.plan.spaces).toEqual([]);
    expect(again.plan.items).toEqual([]);
    expect(again.model).toBe(first);
  });

  it('adds favorites up to the limit, skipping ones already there', () => {
    let model = emptyModel();
    for (let i = 0; i < FAVORITES_LIMIT - 2; i++) {
      model = applyIntent(model, {
        type: 'pinTab',
        itemId: `f${i}`,
        tabId: i + 1,
        spaceId: FAVORITES_ID,
        parentId: null,
        order: `a${i}`,
        url: i === 0 ? 'https://calendar.example.com/' : `https://site${i}.example.com/`,
        title: `f${i}`,
      });
    }
    const { plan, model: after } = run(model, { spaceIds: [], favorites: true });
    expect(plan.favorites).toBe(2); // Calendar is already a favorite; then it's full
    expect(titles(after, FAVORITES_ID).slice(-2)).toEqual(['Issues', 'Design']);
  });
});
