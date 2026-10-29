import { describe, expect, it } from 'vitest';
import {
  githubFolderOf,
  knownRepos,
  livePins,
  pullRequestKey,
  syncIntent,
  type PullRequest,
} from './live';
import { applyIntent, applySessionIntent } from './reducer';
import { flattenSpace } from './tree';
import { emptyModel, emptySession, type Intent, type SidebarModel } from './types';

const S = 'default';
const F = 'live';

const pr = (number: number, created: string, extra: Partial<PullRequest> = {}): PullRequest => ({
  url: `https://github.com/acme/app/pull/${number}`,
  title: `Change ${number}`,
  repo: 'acme/app',
  number,
  draft: false,
  created,
  ...extra,
});

function withFolder(...intents: Intent[]): SidebarModel {
  return [
    { type: 'createLiveFolder', itemId: F, spaceId: S, order: 'a0' } as Intent,
    ...intents,
  ].reduce(applyIntent, emptyModel());
}

/** Applies what GitHub answered, as the service does. */
function sync(model: SidebarModel, pullRequests: PullRequest[] | 'signedOut') {
  let next = 0;
  const intent = syncIntent(
    model,
    githubFolderOf(model)!,
    pullRequests === 'signedOut' ? { signedIn: false } : { signedIn: true, pullRequests },
    () => `pr${next++}-${Math.random().toString(36).slice(2, 6)}`,
    1,
  );
  return { intent, model: intent ? applyIntent(model, intent) : model };
}

const titles = (model: SidebarModel) => livePins(model, githubFolderOf(model)!).map((p) => p.title);

describe('the GitHub Live Folder', () => {
  it('fills newest first, and puts later ones in by when they were opened', () => {
    let { model } = sync(withFolder(), [pr(1, '2026-10-01'), pr(3, '2026-10-03')]);
    expect(titles(model)).toEqual(['Change 3', 'Change 1']);
    ({ model } = sync(model, [pr(1, '2026-10-01'), pr(2, '2026-10-02'), pr(3, '2026-10-03')]));
    expect(titles(model)).toEqual(['Change 3', 'Change 2', 'Change 1']);
    ({ model } = sync(model, [pr(4, '2026-10-04'), pr(1, '2026-10-01'), pr(2, '2026-10-02')]));
    expect(titles(model)).toEqual(['Change 4', 'Change 2', 'Change 1']);
  });

  it('changes nothing when GitHub says the same again', () => {
    const { model } = sync(withFolder(), [pr(1, '2026-10-01')]);
    expect(sync(model, [pr(1, '2026-10-01')]).intent).toBeNull();
  });

  it('updates titles and drafts in place, keeping a custom name', () => {
    let { model } = sync(withFolder(), [pr(1, '2026-10-01', { draft: true })]);
    const id = livePins(model, githubFolderOf(model)!)[0]!.id;
    model = applyIntent(model, { type: 'rename', itemId: id, title: 'Mine' });
    ({ model } = sync(model, [pr(1, '2026-10-01', { title: 'Renamed' })]));
    const pin = livePins(model, githubFolderOf(model)!)[0]!;
    expect(pin).toMatchObject({
      id,
      title: 'Renamed',
      customTitle: 'Mine',
      live: { draft: false },
    });
  });

  it('gives a closed pull request’s open tab back to Today in the folder’s space', () => {
    const { model } = sync(withFolder(), [pr(1, '2026-10-01'), pr(2, '2026-10-02')]);
    const [two] = livePins(model, githubFolderOf(model)!);
    const session = { ...emptySession(), bindings: { [two!.id]: 7 }, orders: { '1': [3] } };
    const { intent, model: after } = sync(model, [pr(1, '2026-10-01')]);
    expect(titles(after)).toEqual(['Change 1']);
    const released = applySessionIntent(session, intent!);
    expect(released.bindings).toEqual({});
    expect(released.orders['1']).toEqual([7, 3]);
    expect(released.tabSpaces[7]).toBe(S);
  });

  it('keeps what it has when signed out, and says so once', () => {
    let { model } = sync(withFolder(), [pr(1, '2026-10-01')]);
    ({ model } = sync(model, 'signedOut'));
    expect(titles(model)).toEqual(['Change 1']);
    expect(githubFolderOf(model)!.live.signedOut).toBe(true);
    expect(sync(model, 'signedOut').intent).toBeNull();
    ({ model } = sync(model, [pr(1, '2026-10-01')]));
    expect(githubFolderOf(model)!.live.signedOut).toBeUndefined();
  });

  it('peeks out new pull requests from a closed folder until they are opened', () => {
    let { model } = sync(withFolder(), [pr(1, '2026-10-01')]);
    model = applyIntent(model, { type: 'setFolderCollapsed', itemId: F, collapsed: true });
    ({ model } = sync(model, [pr(1, '2026-10-01'), pr(2, '2026-10-02')]));
    const shown = () => flattenSpace(model, S, () => false).map((row) => row.item.id);
    const two = livePins(model, githubFolderOf(model)!)[0]!;
    expect(shown()).toEqual([F, two.id]);
    model = applyIntent(model, { type: 'openPin', itemId: two.id, windowId: 1 });
    expect(shown()).toEqual([F]);
  });

  it('a first fill, or one into an open folder, isn’t new', () => {
    let model = applyIntent(withFolder(), {
      type: 'setFolderCollapsed',
      itemId: F,
      collapsed: true,
    });
    ({ model } = sync(model, [pr(1, '2026-10-01')]));
    expect(livePins(model, githubFolderOf(model)!)[0]!.live.unseen).toBeUndefined();
    model = applyIntent(model, { type: 'setFolderCollapsed', itemId: F, collapsed: false });
    ({ model } = sync(model, [pr(1, '2026-10-01'), pr(2, '2026-10-02')]));
    expect(livePins(model, githubFolderOf(model)!).some((p) => p.live.unseen)).toBe(false);
  });

  it('a filter change on a closed folder brings pull requests back without peeking', () => {
    const all = [pr(1, '2026-10-01'), pr(2, '2026-10-02', { draft: true })];
    let { model } = sync(withFolder(), all);
    model = applyIntent(model, { type: 'setFolderCollapsed', itemId: F, collapsed: true });
    const filters = githubFolderOf(model)!.live.filters;
    model = applyIntent(model, {
      type: 'setLiveFilters',
      itemId: F,
      filters: { ...filters, drafts: false },
    });
    ({ model } = sync(model, [pr(1, '2026-10-01')]));
    model = applyIntent(model, { type: 'setLiveFilters', itemId: F, filters });
    ({ model } = sync(model, all));
    expect(titles(model)).toEqual(['Change 2', 'Change 1']);
    expect(livePins(model, githubFolderOf(model)!).some((p) => p.live.unseen)).toBe(false);
  });

  it('opening the folder marks its new pull requests seen', () => {
    let { model } = sync(withFolder(), [pr(1, '2026-10-01')]);
    model = applyIntent(model, { type: 'setFolderCollapsed', itemId: F, collapsed: true });
    ({ model } = sync(model, [pr(1, '2026-10-01'), pr(2, '2026-10-02')]));
    model = applyIntent(model, { type: 'setFolderCollapsed', itemId: F, collapsed: false });
    expect(livePins(model, githubFolderOf(model)!).some((p) => p.live.unseen)).toBe(false);
  });

  it('holds only its own pull requests, which stay in it', () => {
    const { model } = sync(
      withFolder({
        type: 'pinTab',
        itemId: 'p',
        tabId: 1,
        spaceId: S,
        parentId: null,
        order: 'a1',
        url: 'https://example.com',
        title: 'Example',
      }),
      [pr(1, '2026-10-01')],
    );
    const live = livePins(model, githubFolderOf(model)!)[0]!;
    const moves: Intent[] = [
      { type: 'move', itemId: 'p', parentId: F, order: 'a5' },
      { type: 'move', itemId: live.id, parentId: null, order: 'a5' },
      { type: 'moveToSpace', itemId: live.id, spaceId: 'favorites', order: 'a0' },
      { type: 'createFolder', itemId: 'g', spaceId: S, parentId: F, order: 'a5', name: 'g' },
    ];
    for (const intent of moves) expect(applyIntent(model, intent)).toBe(model);
  });

  it('is made once; deleting it takes its pull requests and turns it off', () => {
    let { model } = sync(withFolder(), [pr(1, '2026-10-01')]);
    expect(model.settings.githubFolder).toBe(true);
    expect(
      applyIntent(model, { type: 'createLiveFolder', itemId: 'other', spaceId: S, order: 'a3' }),
    ).toBe(model);
    const ids = livePins(model, githubFolderOf(model)!).map((p) => p.id);
    model = applyIntent(model, {
      type: 'deleteLiveFolder',
      itemId: F,
      itemIds: ids,
      spaceId: S,
      windowId: 1,
    });
    expect(model.items).toEqual({});
    expect(model.settings.githubFolder).toBe(false);
    model = applyIntent(model, { type: 'createLiveFolder', itemId: F, spaceId: S, order: 'a0' });
    expect(model.settings.githubFolder).toBe(true);
  });

  it('offers every repository with a pull request, and shows only the chosen ones', () => {
    const all = [pr(1, '2026-10-01', { repo: 'acme/web' }), pr(2, '2026-10-02')];
    let { model } = sync(withFolder(), all);
    const folder = githubFolderOf(model)!;
    model = applyIntent(model, {
      type: 'setLiveFilters',
      itemId: F,
      filters: { ...folder.live.filters, repos: ['acme/web', 'zeta/api'] },
    });
    ({ model } = sync(model, all));
    expect(titles(model)).toEqual(['Change 1']);
    expect(knownRepos(githubFolderOf(model)!)).toEqual(['acme/app', 'acme/web', 'zeta/api']);
  });
});

describe('pullRequestKey', () => {
  it('names the pull request a page is part of, ignoring case', () => {
    const key = pullRequestKey('https://github.com/acme/app/pull/7');
    expect(key).toBe('acme/app#7');
    expect(pullRequestKey('https://github.com/Acme/App/pull/7/files?w=1')).toBe(key);
    expect(pullRequestKey('https://github.com/acme/app/pull/7#discussion')).toBe(key);
    expect(pullRequestKey('https://github.com/acme/app/pull/70')).not.toBe(key);
    expect(pullRequestKey('https://github.com/acme/app/pulls')).toBeUndefined();
    expect(pullRequestKey('https://github.com/acme/app/issues/7')).toBeUndefined();
  });
});
