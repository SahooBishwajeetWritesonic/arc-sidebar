import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPACE_ID,
  FAVORITES_ID,
  defaultSettings,
  emptySession,
  type ArchiveEntry,
  type PinItem,
} from '@/model/types';
import type { HistoryEntry, TabInfo } from '@/platform/types';
import type { CommandContext } from './actions';
import { completeAddress, searchCommands } from './search';

const tab = (id: number, title: string, url: string): TabInfo => ({
  id,
  windowId: 1,
  title,
  url,
  loading: false,
  active: id === 1,
  audible: false,
  muted: false,
  discarded: false,
});

const pin = (id: string, spaceId: string, title: string, url: string): PinItem => ({
  id,
  kind: 'pin',
  spaceId,
  parentId: null,
  order: 'a0',
  title,
  url,
});

const archived = (id: string, title: string, url: string, daysAgo: number): ArchiveEntry => ({
  id,
  title,
  url,
  spaceId: DEFAULT_SPACE_ID,
  archivedAt: Date.UTC(2026, 10, 6) - daysAgo * 86_400_000,
  reason: 'closed',
  batchId: id,
});

/** Two spaces; tab 1 is current; Linear is pinned, Gmail a favorite, GitHub pinned in Work. */
function context(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    model: {
      rev: 1,
      spaces: [
        { id: DEFAULT_SPACE_ID, name: 'Space' },
        { id: 'work', name: 'Work' },
      ],
      items: {
        linear: pin('linear', DEFAULT_SPACE_ID, 'Linear', 'https://linear.app/'),
        gmail: pin('gmail', FAVORITES_ID, 'Gmail', 'https://mail.google.com/'),
        github: pin('github', 'work', 'GitHub', 'https://github.com/'),
      },
      settings: defaultSettings(),
    },
    session: {
      ...emptySession(),
      bindings: { linear: 2, gmail: 3 },
      tabSpaces: { 1: DEFAULT_SPACE_ID, 4: DEFAULT_SPACE_ID, 5: 'work' },
    },
    spaceId: DEFAULT_SPACE_ID,
    tabs: new Map(
      [
        tab(1, 'Arc Docs', 'https://resources.arc.net/'),
        tab(2, 'My issues · Linear', 'https://linear.app/team/issues'),
        tab(3, 'Inbox (3) - Gmail', 'https://mail.google.com/mail/u/0/'),
        tab(4, 'Sidebar explorations – Figma', 'https://www.figma.com/file/abc'),
        tab(5, 'Engineering Wiki', 'https://www.notion.so/wiki'),
      ].map((t) => [t.id, t]),
    ),
    activeId: 1,
    previousId: 4,
    todayIds: [4, 1],
    sidebarOpen: true,
    archive: [
      archived('a1', 'Quarterly planning doc', 'https://docs.example.com/plan', 1),
      archived('a2', 'Old Figma file', 'https://www.figma.com/file/old', 2),
    ],
    ...overrides,
  };
}

const keys = (results: { key: string }[]) => results.map((result) => result.key);

describe('searchCommands', () => {
  it('suggests the previous tab and this space’s tabs when nothing is typed', () => {
    expect(keys(searchCommands('', context(), []))).toEqual(['tab:4', 'pin:linear']);
  });

  it('opens a typed address first, or switches to a tab already showing it', () => {
    expect(keys(searchCommands('arc.net', context(), [])).slice(0, 2)).toEqual([
      'open-url',
      'search',
    ]);
    const results = searchCommands('linear.app/team/issues', context(), []);
    expect(keys(results).slice(0, 2)).toEqual(['pin:linear', 'open-url']);
    expect(results[0]!.hint).toBe('Switch to Tab');
  });

  it('opens a link’s address first, from its keyword and words', () => {
    const results = searchCommands('lh 3300', context(), []);
    expect(keys(results).slice(0, 2)).toEqual(['open-url', 'search']);
    expect(results[0]).toMatchObject({
      command: { type: 'openUrl', url: 'http://localhost:3300' },
      title: 'localhost:3300',
      detail: 'Localhost',
    });
    // Over an inline completion, too.
    const completed = searchCommands('lh', context(), [], {
      completion: { text: 'lhr.example.com', url: 'https://lhr.example.com/' },
    });
    expect(completed[0]!.command).toEqual({ type: 'openUrl', url: 'http://localhost:3000' });
  });

  it('switches to a tab already showing a link’s address, whatever its title', () => {
    const tabs = new Map(context().tabs);
    tabs.set(7, tab(7, 'Untitled', 'https://acme.atlassian.net/browse/ARC-42'));
    const jira = {
      id: 'jira',
      name: 'Jira',
      keywords: ['jira'],
      url: 'https://acme.atlassian.net/browse/ARC-{1}',
    };
    const base = context({ tabs });
    const ctx = {
      ...base,
      model: {
        ...base.model,
        settings: { ...base.model.settings, shortcuts: [...base.model.settings.shortcuts, jira] },
      },
    };
    expect(keys(searchCommands('jira 42', ctx, [])).slice(0, 2)).toEqual(['tab:7', 'open-url']);
  });

  it('lists a link’s pages from history after it, and opens the one it completes to', () => {
    const visit = (url: string, title: string, lastVisitTime: number): HistoryEntry => ({
      url,
      title,
      visitCount: 1,
      typedCount: 0,
      lastVisitTime,
    });
    const linkHistory = [
      visit('http://localhost:5173/', 'Vite + React', 3),
      visit('http://localhost:3300/', 'Acme dashboard', 2),
      visit('http://localhost:3000/', 'Default', 1),
    ];
    const results = searchCommands('lh', context(), [], { linkHistory });
    expect(keys(results).slice(0, 4)).toEqual([
      'open-url',
      'link:http://localhost:5173',
      'link:http://localhost:3300',
      'search',
    ]);
    expect(results[1]).toMatchObject({ title: 'localhost:5173', detail: 'Vite + React' });

    const completed = searchCommands('lh 5', context(), [], {
      linkHistory,
      completion: { text: 'lh 5173', url: 'http://localhost:5173' },
    });
    expect(completed[0]!.command).toEqual({ type: 'openUrl', url: 'http://localhost:5173' });
    expect(keys(completed)).not.toContain('link:http://localhost:5173');
  });

  it('finds history by letters in order, after the search, frecent pages first', () => {
    const now = Date.UTC(2026, 10, 6);
    const visit = (url: string, title: string, visitCount: number, daysAgo: number) => ({
      url,
      title,
      visitCount,
      typedCount: 0,
      lastVisitTime: now - daysAgo * 86_400_000,
    });
    const history = [
      visit('https://hn.example/old', 'Hacker News archive', 1, 200),
      visit('https://news.ycombinator.com/', 'Hacker News', 90, 1),
    ];
    const results = searchCommands('hckr nws', context(), history, { now });
    const found = keys(results).filter((key) => key.startsWith('history:'));
    expect(found).toEqual([
      'history:https://news.ycombinator.com/',
      'history:https://hn.example/old',
    ]);
    expect(keys(results).indexOf('search')).toBeLessThan(keys(results).indexOf(found[0]!));
  });

  it('lists a site’s suggestions under the search, while searching that site', () => {
    const youtube = context().model.settings.shortcuts.find((s) => s.id === 'youtube')!;
    const results = searchCommands('lofi', context(), [], {
      site: youtube,
      siteSuggestions: ['lofi', 'lofi beats', 'Lofi Beats', 'lofi girl'],
    });
    expect(results.map((result) => result.title)).toEqual(['lofi', 'lofi beats', 'lofi girl']);
    expect(results[1]!.command).toEqual({
      type: 'openUrl',
      url: 'https://www.youtube.com/results?search_query=lofi%20beats',
    });
  });

  it('lists archived tabs to restore, after open tabs and before history', () => {
    const history = [
      {
        url: 'https://docs.example.com/plan',
        title: 'Quarterly planning doc',
        visitCount: 3,
        typedCount: 0,
        lastVisitTime: 0,
      },
    ];
    const results = searchCommands('planning', context(), history);
    const row = results.find((result) => result.key === 'archive:a1')!;
    expect(row).toMatchObject({
      command: { type: 'restoreArchived', entryId: 'a1' },
      hint: 'Restore',
    });
    // Its page isn't listed again from history.
    expect(keys(results)).not.toContain('history:https://docs.example.com/plan');
  });

  it('puts strong tab matches before the search and weak ones after', () => {
    const results = searchCommands('figma', context(), []);
    expect(keys(results).slice(0, 2)).toEqual(['tab:4', 'search']);
    const weak = keys(searchCommands('igma', context(), []));
    expect(weak.indexOf('search')).toBeLessThan(weak.indexOf('tab:4'));
  });

  it('finds tabs, pins and favorites in every space, and names the other space', () => {
    const wiki = searchCommands('wiki', context(), []).find((r) => r.key === 'tab:5')!;
    expect(wiki.detail).toBe('Work');
    const github = searchCommands('github', context(), []).find((r) => r.key === 'pin:github')!;
    expect(github.command).toEqual({ type: 'openPin', itemId: 'github' });
    expect(github.hint).toBe('Open');
    const gmail = searchCommands('gmail', context(), []).find((r) => r.key === 'pin:gmail')!;
    expect(gmail.detail).toBe('Favorites');
  });

  it('never offers the current tab', () => {
    expect(keys(searchCommands('arc docs', context(), []))).not.toContain('tab:1');
  });

  it('matches spaces and actions by name and other words', () => {
    expect(keys(searchCommands('work', context(), [])).slice(0, 2)).toEqual([
      'space:work',
      'search',
    ]);
    expect(keys(searchCommands('pin', context(), []))).toContain('action:pinTab:');
    expect(keys(searchCommands('copy link', context(), []))).toContain('action:copyUrl:');
    expect(keys(searchCommands('move work', context(), []))).toContain('action:moveToSpace:work');
  });

  it('lists every action after Tab, and hides sidebar-only ones while it is closed', () => {
    const all = keys(searchCommands('', context(), [], { actionsOnly: true }));
    expect(all[0]).toBe('action:pinTab:');
    expect(all).toContain('action:viewArchive:');
    const closed = keys(
      searchCommands('', context({ sidebarOpen: false }), [], { actionsOnly: true }),
    );
    expect(closed).not.toContain('action:viewArchive:');
    expect(keys(searchCommands('dark', context(), [], { actionsOnly: true }))).toEqual([
      'action:appearance:dark',
    ]);
  });

  it('offers Reset Space only when a pinned tab is away, and folds Pinned', () => {
    const actions = (ctx: CommandContext) =>
      keys(searchCommands('', ctx, [], { actionsOnly: true }));
    // Linear's tab is on its issues, away from the pinned page.
    expect(actions(context())).toContain('action:resetSpace:');
    expect(actions(context())).toContain('action:togglePinned:');
    const home = new Map(context().tabs);
    home.set(2, { ...home.get(2)!, url: 'https://linear.app/' });
    expect(actions(context({ tabs: home }))).not.toContain('action:resetSpace:');
    const folded = context();
    folded.model.spaces[0] = { ...folded.model.spaces[0]!, pinnedCollapsed: true };
    expect(searchCommands('expand pinned', folded, [], { actionsOnly: true })[0]?.title).toBe(
      'Expand Pinned',
    );
  });

  it('offers pin actions for a pinned tab, and reset once it has navigated away', () => {
    const ctx = context({ activeId: 2, todayIds: [4, 1] });
    const pinned = keys(searchCommands('', ctx, [], { actionsOnly: true }));
    expect(pinned).toContain('action:unpinTab:');
    expect(pinned).toContain('action:renameTab:');
    expect(pinned).toContain('action:resetTab:');
    expect(pinned).not.toContain('action:pinTab:');
  });

  it('offers Add Split View for a Today tab and Remove Split View once it is split', () => {
    const plain = keys(searchCommands('split', context(), [], { actionsOnly: true }));
    expect(plain).toContain('action:splitView:');
    const tabs = new Map(context().tabs);
    tabs.set(1, { ...tabs.get(1)!, splitViewId: 3 });
    const split = keys(searchCommands('split', context({ tabs }), [], { actionsOnly: true }));
    expect(split).toEqual(['action:removeSplit:']);
  });

  it('picks what to split with: this space’s other unsplit tabs, an address or history', () => {
    const tabs = new Map(context().tabs);
    tabs.set(6, { ...tabs.get(4)!, id: 6, title: 'Already split', splitViewId: 3 });
    const ctx = context({ tabs, todayIds: [4, 6, 1] });
    const empty = searchCommands('', ctx, [], { pickSplit: true });
    expect(keys(empty)).toEqual(['tab:4']);
    expect(empty[0]!.hint).toBe('Split');
    expect(keys(searchCommands('arc.net', ctx, [], { pickSplit: true }))).toEqual(['open-url']);
  });

  it('adds history that isn’t already shown, most visited first', () => {
    const history: HistoryEntry[] = [
      {
        url: 'https://figma.com/file/abc',
        title: 'Old',
        visitCount: 9,
        typedCount: 0,
        lastVisitTime: 1,
      },
      {
        url: 'https://example.com/a',
        title: 'Example docs A',
        visitCount: 1,
        typedCount: 0,
        lastVisitTime: 2,
      },
      {
        url: 'https://example.com/b',
        title: 'Example docs B',
        visitCount: 5,
        typedCount: 0,
        lastVisitTime: 1,
      },
    ];
    const results = keys(searchCommands('example docs', context(), history));
    expect(results.filter((key) => key.startsWith('history:'))).toEqual([
      'history:https://example.com/b',
      'history:https://example.com/a',
    ]);
  });
});

describe('completeAddress', () => {
  const history: HistoryEntry[] = [
    {
      url: 'https://github.com/anthropics/claude',
      title: '',
      visitCount: 30,
      typedCount: 4,
      lastVisitTime: 0,
    },
    { url: 'https://gist.github.com/', title: '', visitCount: 2, typedCount: 1, lastVisitTime: 0 },
    { url: 'https://www.gitlab.com/', title: '', visitCount: 50, typedCount: 0, lastVisitTime: 0 },
  ];

  it('completes to the host typed most often', () => {
    expect(completeAddress('gi', history)).toEqual({
      text: 'github.com',
      url: 'https://github.com/',
    });
    expect(completeAddress('gis', history)?.text).toBe('gist.github.com');
  });

  it('completes whole addresses once a slash is typed', () => {
    expect(completeAddress('github.com/an', history)?.url).toBe(
      'https://github.com/anthropics/claude',
    );
  });

  it('never completes from pages that were only clicked to, or what is already whole', () => {
    expect(completeAddress('gitl', history)).toBeNull();
    expect(completeAddress('github.com', history)).toBeNull();
    expect(completeAddress('git hub', history)).toBeNull();
  });
});
