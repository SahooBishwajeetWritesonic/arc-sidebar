import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyIntent } from '@/model/reducer';
import {
  emptyArchive,
  emptyModel,
  emptySession,
  type Intent,
  type IntentResult,
  type SidebarModel,
} from '@/model/types';
import type { Platform } from '@/platform/types';

/**
 * Two windows editing at once: this panel shows its own changes immediately, on top of
 * whatever the service last saved, including another window's changes made meanwhile.
 */

const pin = (itemId: string, order: string): Intent => ({
  type: 'pinTab',
  itemId,
  tabId: Number(itemId.slice(1)),
  spaceId: 'default',
  parentId: null,
  order,
  url: `https://example.com/${itemId}`,
  title: itemId,
});

/** A fake service: saved writes are pushed to the panel by hand, intents answered by hand. */
function fakeService() {
  let model = emptyModel();
  const listeners = new Set<(model: SidebarModel) => void>();
  const answers: { intent: Intent; resolve: (r: IntentResult) => void; reject: () => void }[] = [];
  const platform = {
    loadModel: async () => model,
    loadSession: async () => emptySession(),
    loadArchive: async () => emptyArchive(),
    onModelChange: (listener: (model: SidebarModel) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onSessionChange: () => () => {},
    onArchiveChange: () => () => {},
    sendIntent: (intent: Intent) =>
      new Promise<IntentResult>((resolve, reject) => answers.push({ intent, resolve, reject })),
  } as unknown as Platform;
  return {
    platform,
    /** The service saves an intent (from this window or another) and tells every panel. */
    save(intent: Intent) {
      model = { ...applyIntent(model, intent), rev: model.rev + 1 };
      listeners.forEach((listener) => listener(model));
      return model.rev;
    },
    answers,
  };
}

const titles = (model: SidebarModel) =>
  Object.values(model.items)
    .map((item) => (item.kind === 'pin' ? (item.customTitle ?? item.title) : item.name))
    .sort();

describe('a panel while another window edits', () => {
  // The store keeps what was saved and what's pending between calls: a fresh copy each test.
  beforeEach(() => vi.resetModules());

  async function connected() {
    const sidebar = await import('./sidebar');
    const service = fakeService();
    service.save(pin('p1', 'a0'));
    await sidebar.connectSidebar(service.platform, 1);
    return { ...sidebar, service };
  }

  it('shows its own change at once, and the other window’s as it arrives', async () => {
    const { dispatch, useSidebar, service } = await connected();
    void dispatch({ type: 'rename', itemId: 'p1', title: 'Mail' });
    expect(titles(useSidebar.getState().model)).toEqual(['Mail']);

    // The other window pins a tab before this one's rename is saved.
    service.save(pin('p2', 'a1'));
    expect(titles(useSidebar.getState().model)).toEqual(['Mail', 'p2']);

    // Then the rename is saved and answered: nothing jumps.
    const { intent, resolve } = service.answers[0]!;
    const modelRev = service.save(intent);
    resolve({ modelRev, sessionRev: 0, archiveRev: 0 });
    await Promise.resolve();
    expect(titles(useSidebar.getState().model)).toEqual(['Mail', 'p2']);
  });

  it('drops only its own refused change, keeping the other window’s', async () => {
    const { dispatch, useSidebar, service } = await connected();
    const refused = dispatch({ type: 'rename', itemId: 'p1', title: 'Mail' });
    service.save(pin('p2', 'a1'));
    service.answers[0]!.reject();
    await refused;
    expect(titles(useSidebar.getState().model)).toEqual(['p1', 'p2']);
  });

  it('keeps its change on top when the other window changes the same item', async () => {
    const { dispatch, useSidebar, service } = await connected();
    void dispatch({ type: 'rename', itemId: 'p1', title: 'Mail' });
    service.save({ type: 'rename', itemId: 'p1', title: 'Inbox' });
    // Until the service answers, this window shows what it asked for; the service applies it last.
    expect(titles(useSidebar.getState().model)).toEqual(['Mail']);
    const { intent, resolve } = service.answers[0]!;
    resolve({ modelRev: service.save(intent), sessionRev: 0, archiveRev: 0 });
    await Promise.resolve();
    expect(titles(useSidebar.getState().model)).toEqual(['Mail']);
  });
});
