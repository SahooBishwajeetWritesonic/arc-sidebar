import { describe, expect, it } from 'vitest';
import { applyIntent, applySessionIntent } from '@/model/reducer';
import {
  emptyModel,
  emptySession,
  type Intent,
  type SessionState,
  type SidebarModel,
} from '@/model/types';
import { inverseOf, pushUndo, undoLast } from './undo';

const S = 'default';

type State = { model: SidebarModel; session: SessionState };

const pin = (itemId: string, tabId: number, order: string): Intent => ({
  type: 'pinTab',
  itemId,
  tabId,
  spaceId: S,
  parentId: null,
  order,
  url: `https://example.com/${itemId}`,
  title: itemId,
});

/** A Today of tabs 1–4 and a pin of tab 9. */
function start(): State {
  const session: SessionState = {
    ...emptySession(),
    orders: { '1': [1, 2, 3, 4, 9] },
    tabSpaces: { 1: S, 2: S, 3: S, 4: S, 9: S },
  };
  return run({ model: emptyModel(), session }, pin('p9', 9, 'a0'));
}

function run(state: State, ...intents: Intent[]): State {
  let { model, session } = state;
  for (const intent of intents) {
    const before = model;
    model = applyIntent(model, intent, session);
    session = applySessionIntent(session, intent, () => 1, before);
  }
  return { model, session };
}

function roundTrip(...intents: Intent[]) {
  const before = start();
  const after = run(before, ...intents);
  return { before, undone: run(after, ...inverseOf(before, after, 1)) };
}

describe('inverseOf', () => {
  it('puts a reordered Today tab back', () => {
    const { before, undone } = roundTrip({
      type: 'reorderToday',
      windowId: 1,
      tabId: 3,
      beforeTabId: 1,
    });
    expect(undone.session.orders['1']).toEqual(before.session.orders['1']);
  });

  it('puts a tab pinned from Today back in its place', () => {
    const { before, undone } = roundTrip(pin('p2', 2, 'a1'));
    expect(undone.model.items.p2).toBeUndefined();
    expect(undone.session.orders['1']).toEqual(before.session.orders['1']);
  });

  it('pins an unpinned tab again, and moves a pin back', () => {
    const unpin = roundTrip({ type: 'unpin', itemId: 'p9', windowId: 1, spaceId: S });
    expect(unpin.undone.model.items.p9).toEqual(unpin.before.model.items.p9);
    expect(unpin.undone.session.bindings).toEqual({ p9: 9 });

    const move = roundTrip({ type: 'move', itemId: 'p9', parentId: null, order: 'b0' });
    expect(move.undone.model.items.p9).toEqual(move.before.model.items.p9);
  });

  it('moves a Today tab back to its space', () => {
    const before = start();
    const work = {
      ...before,
      model: { ...before.model, spaces: [...before.model.spaces, { id: 'work', name: 'Work' }] },
    };
    const after = run(work, { type: 'moveTabToSpace', tabId: 3, spaceId: 'work' });
    const undone = run(after, ...inverseOf(work, after, 1));
    expect(undone.session.tabSpaces[3]).toBe(S);
    expect(undone.session.orders['1']).toEqual(before.session.orders['1']);
  });

  it('removes a pin added with no tab (an Option-drag copy)', () => {
    const { undone } = roundTrip({
      type: 'addPin',
      itemId: 'copy',
      spaceId: S,
      parentId: null,
      order: 'a5',
      url: 'https://example.com/',
    });
    expect(undone.model.items.copy).toBeUndefined();
  });

  it('has nothing to undo when nothing changed', () => {
    expect(inverseOf(start(), start(), 1)).toEqual([]);
  });
});

describe('the undo stack', () => {
  it('undoes latest first, and never twice', () => {
    const done: string[] = [];
    const first = pushUndo(() => done.push('first'));
    pushUndo(() => done.push('second'));
    expect(undoLast()).toBe(true);
    first.run(); // from its toast
    expect(undoLast()).toBe(false);
    first.run();
    expect(done).toEqual(['second', 'first']);
  });
});
