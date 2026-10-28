import { describe, expect, it } from 'vitest';
import { NotArcSidebarError, parseArcSidebar } from './arc';
import fixture from './fixtures/arc-sidebar.json';

describe('parseArcSidebar', () => {
  const arc = parseArcSidebar(fixture);
  const space = (name: string) => arc.spaces.find((s) => s.name === name)!;

  it('reads the container with the most spaces, in order', () => {
    expect(arc.spaces.map((s) => s.name)).toEqual(['Work', 'Lab', 'Home', 'Misc']);
  });

  it('maps icons and profiles', () => {
    expect(space('Work').icon).toEqual({ type: 'symbol', name: 'planet' });
    expect(space('Lab').icon).toEqual({ type: 'emoji', char: '🧪' });
    expect(space('Home').icon).toEqual({ type: 'symbol', name: 'cloud' });
    expect(space('Misc').icon).toBeUndefined(); // an Arc symbol we don't have
    expect(space('Work').profile).toBeUndefined();
    expect(space('Home').profile).toBe('Profile 2');
  });

  it('keeps the pinned tree, custom titles and live folders', () => {
    expect(space('Work').pinned).toEqual([
      { kind: 'tab', url: 'https://mail.example.com/inbox', title: 'Inbox' },
      {
        kind: 'folder',
        name: 'Docs',
        live: false,
        children: [
          {
            kind: 'tab',
            url: 'https://docs.example.com/spec',
            title: 'Spec v2 – Docs',
            customTitle: 'Spec',
          },
          {
            kind: 'folder',
            name: 'Old',
            live: false,
            children: [{ kind: 'tab', url: 'https://docs.example.com/archive', title: 'Archive' }],
          },
        ],
      },
      {
        kind: 'folder',
        name: 'Pull Requests',
        live: true,
        children: [{ kind: 'tab', url: 'https://git.example.com/pull/1', title: 'Fix the build' }],
      },
    ]);
  });

  it('finds the pinned container whichever way round the ids are listed', () => {
    // Lab lists "unpinned" first, and one tab points at its container
    // without being in the container's childrenIds.
    expect(space('Lab').pinned.map((node) => node.kind === 'tab' && node.title)).toEqual([
      'Paper',
      'Notebook',
    ]);
    expect(space('Misc').pinned).toEqual([]);
  });

  it("counts Today tabs and skips what Chrome can't open", () => {
    expect(space('Work').todayCount).toBe(2);
    expect(arc.skipped).toBe(2); // a note and an arc:// page
  });

  it("takes Favorites from the default profile's top apps", () => {
    expect(arc.favorites.map((tab) => tab.title)).toEqual(['Calendar', 'Issues', 'Design']);
  });

  it('rejects files that are not Arc sidebars', () => {
    expect(() => parseArcSidebar({})).toThrow(NotArcSidebarError);
    expect(() => parseArcSidebar({ sidebar: { containers: [{ global: {} }] } })).toThrow(
      NotArcSidebarError,
    );
    expect(() => parseArcSidebar(null)).toThrow(NotArcSidebarError);
  });
});
