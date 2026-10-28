import { create } from 'zustand';
import { applyArchiveIntent, applyIntent, applySessionIntent } from '@/model/reducer';
import {
  DEFAULT_SPACE_ID,
  emptyArchive,
  emptyModel,
  emptySession,
  type ArchiveState,
  type Intent,
  type IntentResult,
  type SessionState,
  type SidebarModel,
} from '@/model/types';
import type { Platform } from '@/platform/types';
import { useTabs } from './tabs';

export interface SidebarState {
  ready: boolean;
  windowId: number | null;
  spaceId: string;
  /** What the panel shows: the saved state plus intents still in flight. */
  model: SidebarModel;
  session: SessionState;
  archive: ArchiveState;
}

export const useSidebar = create<SidebarState>()(() => ({
  ready: false,
  windowId: null,
  spaceId: DEFAULT_SPACE_ID,
  model: emptyModel(),
  session: emptySession(),
  archive: emptyArchive(),
}));

let platform: Platform | undefined;
let saved = { model: emptyModel(), session: emptySession(), archive: emptyArchive() };

interface Pending {
  intent: Intent;
  result?: IntentResult;
}
let pending: Pending[] = [];

/** Pinned items whose tab is being opened; hidden from Today until bound. */
const opening = new Map<string, string>();

/**
 * The saved state with every unconfirmed intent re-applied (they're idempotent). An intent
 * drops once the saved state reaches the revisions the service reported for it.
 */
function rebuild() {
  const { windowId } = useSidebar.getState();
  pending = pending.filter(
    ({ result }) =>
      !result ||
      saved.model.rev < result.modelRev ||
      saved.session.rev < result.sessionRev ||
      saved.archive.rev < result.archiveRev,
  );
  let { model, session, archive } = saved;
  for (const { intent } of pending) {
    model = applyIntent(model, intent);
    session = applySessionIntent(session, intent);
    archive = applyArchiveIntent(archive, intent);
  }
  for (const itemId of opening.keys()) {
    if (session.bindings[itemId] !== undefined) opening.delete(itemId);
  }
  useSidebar.setState({ model, session, archive });
  useTabs.setState({
    order: session.orders[String(windowId)] ?? [],
    bound: new Set(Object.values(session.bindings)),
    openingUrls: [...opening.values()],
  });
}

export async function connectSidebar(source: Platform, windowId: number): Promise<() => void> {
  platform = source;
  useSidebar.setState({ windowId });
  const offModel = source.onModelChange((model) => {
    saved = { ...saved, model };
    rebuild();
  });
  const offSession = source.onSessionChange((session) => {
    saved = { ...saved, session };
    rebuild();
  });
  const offArchive = source.onArchiveChange((archive) => {
    saved = { ...saved, archive };
    rebuild();
  });
  const [model, session, archive] = await Promise.all([
    source.loadModel(),
    source.loadSession(),
    source.loadArchive(),
  ]);
  // A change event may have beaten the initial load; keep the newer one.
  saved = {
    model: model.rev >= saved.model.rev ? model : saved.model,
    session: session.rev >= saved.session.rev ? session : saved.session,
    archive: archive.rev >= saved.archive.rev ? archive : saved.archive,
  };
  rebuild();
  useSidebar.setState({ ready: true });
  return () => {
    offModel();
    offSession();
    offArchive();
  };
}

export function dispatch(intent: Intent) {
  const entry: Pending = { intent };
  pending.push(entry);
  if (intent.type === 'openPin') {
    const item = useSidebar.getState().model.items[intent.itemId];
    if (item?.kind === 'pin') {
      opening.set(item.id, item.url);
      setTimeout(() => opening.delete(item.id) && rebuild(), 3000);
    }
  }
  rebuild();
  platform?.sendIntent(intent).then(
    (result) => {
      entry.result = result;
      rebuild();
    },
    () => {
      // The service refused it: drop the optimistic change.
      pending = pending.filter((p) => p !== entry);
      rebuild();
    },
  );
}

export const newId = () => crypto.randomUUID();
