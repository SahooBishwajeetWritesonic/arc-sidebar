import { generateNKeysBetween } from 'fractional-indexing';
import { withTabBefore, withTabOnTop, withoutTab } from '@/platform/today-order';
import { filtersKey, githubFolderOf } from './live';
import { canPlace, childrenOf, descendants } from './tree';
import {
  ARCHIVE_LIMIT,
  defaultGitHubFilters,
  FAVORITES_ID,
  FAVORITES_LIMIT,
  LIVE_FOLDER_NAME,
  type ArchiveState,
  type Intent,
  type Item,
  type SessionState,
  type SidebarModel,
  type Space,
} from './types';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** The model with a folder about to be created, for checking what can go inside it. */
const withFolder = (model: SidebarModel, folder: Item): SidebarModel => ({
  ...model,
  items: { ...model.items, [folder.id]: folder },
});

function updateSpace(model: SidebarModel, spaceId: string, change: (space: Space) => Space) {
  let changed = false;
  const spaces = model.spaces.map((space) => {
    if (space.id !== spaceId) return space;
    const next = change(space);
    changed ||= next !== space;
    return next;
  });
  return changed ? { ...model, spaces } : model;
}

/** A Live Folder's pull request, no longer new; nothing for anything else. */
const withoutUnseen = (item: Item): Item[] => {
  if (item.kind !== 'pin' || !item.live?.unseen) return [];
  const { unseen: _seen, ...live } = item.live;
  return [{ ...item, live }];
};

/** Unbinds the tabs of removed pins and puts them on top of Today in `spaceId`, first topmost. */
function releaseTabs(
  session: SessionState,
  itemIds: readonly string[],
  spaceId: string,
  windowOf: (tabId: number) => number | undefined,
  windowId: number,
): SessionState {
  const removed = new Set(itemIds);
  const bindings: Record<string, number> = {};
  const released: number[] = [];
  for (const [itemId, tabId] of Object.entries(session.bindings)) {
    if (removed.has(itemId)) released.push(tabId);
    else bindings[itemId] = tabId;
  }
  if (!released.length) return session;
  const orders = { ...session.orders };
  const tabSpaces = { ...session.tabSpaces };
  for (const tabId of [...released].reverse()) {
    tabSpaces[tabId] = spaceId;
    const key = String(windowOf(tabId) ?? windowId);
    orders[key] = withTabOnTop(orders[key] ?? [], tabId);
  }
  return { ...session, bindings, tabSpaces, orders };
}

/**
 * The saved part of an intent. Pure: panels apply it at once for instant feedback,
 * then the service applies it again and saves the result.
 */
export function applyIntent(model: SidebarModel, intent: Intent): SidebarModel {
  const items = model.items;
  const item = 'itemId' in intent ? items[intent.itemId] : undefined;
  const put = (...changed: Item[]): SidebarModel => ({
    ...model,
    items: { ...items, ...Object.fromEntries(changed.map((i) => [i.id, i])) },
  });

  switch (intent.type) {
    case 'pinTab':
      if (
        item ||
        !canPlace(model, { id: intent.itemId, kind: 'pin' }, intent.spaceId, intent.parentId)
      ) {
        return model;
      }
      return put({
        kind: 'pin',
        id: intent.itemId,
        spaceId: intent.spaceId,
        parentId: intent.parentId,
        order: intent.order,
        url: intent.url,
        title: intent.title,
      });

    case 'unpin': {
      if (item?.kind !== 'pin') return model;
      const { [item.id]: _removed, ...rest } = items;
      return { ...model, items: rest };
    }

    case 'replacePinUrl':
      if (item?.kind !== 'pin') return model;
      return put({ ...item, url: intent.url, title: intent.title });

    case 'rename': {
      if (!item) return model;
      const title = intent.title?.trim() || null;
      if (item.kind === 'folder') return title ? put({ ...item, name: title }) : model;
      const { customTitle: _old, ...pin } = item;
      return put(title && title !== item.title ? { ...pin, customTitle: title } : pin);
    }

    case 'createFolder': {
      if (item) return model;
      if (
        !canPlace(model, { id: intent.itemId, kind: 'folder' }, intent.spaceId, intent.parentId)
      ) {
        return model;
      }
      const folder: Item = {
        kind: 'folder',
        id: intent.itemId,
        spaceId: intent.spaceId,
        parentId: intent.parentId,
        order: intent.order,
        name: intent.name,
        collapsed: false,
      };
      // Items from this space that can go inside it: not its own parents.
      const moved = (intent.childIds ?? [])
        .map((id) => items[id])
        .filter(
          (child): child is Item =>
            child !== undefined &&
            child.spaceId === intent.spaceId &&
            canPlace(withFolder(model, folder), child, intent.spaceId, folder.id),
        );
      const keys = generateNKeysBetween(null, null, moved.length);
      return put(
        folder,
        ...moved.map((child, i) => ({ ...child, parentId: folder.id, order: keys[i]! })),
      );
    }

    case 'setFolderCollapsed': {
      if (item?.kind !== 'folder' || item.collapsed === intent.collapsed) return model;
      // Opening a Live Folder shows its new pull requests: they stop peeking out.
      const seen = intent.collapsed ? [] : childrenOf(model, item.spaceId, item.id);
      return put({ ...item, collapsed: intent.collapsed }, ...seen.flatMap(withoutUnseen));
    }

    case 'setFolderIcon': {
      if (item?.kind !== 'folder') return model;
      const { icon: _old, ...rest } = item;
      if (intent.icon) return put({ ...rest, icon: intent.icon });
      return item.icon ? put(rest) : model;
    }

    case 'openPin':
      return item?.kind === 'pin' && item.live?.unseen ? put(...withoutUnseen(item)) : model;

    case 'createLiveFolder': {
      if (item || githubFolderOf(model)) return model;
      if (!canPlace(model, { id: intent.itemId, kind: 'folder' }, intent.spaceId, null)) {
        return model;
      }
      return {
        ...put({
          kind: 'folder',
          id: intent.itemId,
          spaceId: intent.spaceId,
          parentId: null,
          order: intent.order,
          name: LIVE_FOLDER_NAME,
          collapsed: false,
          live: { source: 'github', filters: defaultGitHubFilters() },
        }),
        settings: { ...model.settings, githubFolder: true },
      };
    }

    case 'setLiveFilters':
      if (item?.kind !== 'folder' || !item.live) return model;
      return put({ ...item, live: { ...item.live, filters: intent.filters } });

    case 'syncLiveFolder': {
      if (item?.kind !== 'folder' || !item.live) return model;
      const next = { ...items };
      // Only its own pull requests: never anything moved out or in since.
      for (const id of intent.removedIds) {
        const removed = next[id];
        if (removed?.kind === 'pin' && removed.live && removed.parentId === item.id)
          delete next[id];
      }
      for (const pin of intent.items) {
        const known = next[pin.id];
        if (known && (known.kind !== 'pin' || known.parentId !== item.id)) continue;
        next[pin.id] = { ...pin, spaceId: item.spaceId, parentId: item.id };
      }
      const { signedOut: _old, ...live } = item.live;
      next[item.id] = {
        ...item,
        live: intent.signedOut
          ? { ...live, signedOut: true }
          : { ...live, filledFor: filtersKey(live.filters), repos: intent.repos },
      };
      return { ...model, items: next };
    }

    case 'deleteLiveFolder': {
      if (item?.kind !== 'folder' || !item.live) return model;
      const gone = new Set([item.id, ...descendants(model, item.id).map((child) => child.id)]);
      return {
        ...model,
        items: Object.fromEntries(Object.entries(items).filter(([id]) => !gone.has(id))),
        settings: { ...model.settings, githubFolder: false },
      };
    }

    case 'move': {
      if (!item) return model;
      // Into a folder means into its space; a folder can't go inside itself.
      const parent = intent.parentId ? items[intent.parentId] : undefined;
      const spaceId = parent?.spaceId ?? intent.spaceId ?? item.spaceId;
      if (!canPlace(model, item, spaceId, intent.parentId)) return model;
      const inside =
        item.kind === 'folder' && spaceId !== item.spaceId ? descendants(model, item.id) : [];
      return put(
        { ...item, spaceId, parentId: intent.parentId, order: intent.order },
        ...inside.map((child) => ({ ...child, spaceId })),
      );
    }

    case 'deleteFolder': {
      if (item?.kind !== 'folder') return model;
      // Its contents move up into the folder's place, keeping their order.
      const siblings = childrenOf(model, item.spaceId, item.parentId);
      const index = siblings.findIndex((s) => s.id === item.id);
      const children = childrenOf(model, item.spaceId, item.id);
      const keys = generateNKeysBetween(
        siblings[index - 1]?.order ?? null,
        siblings[index + 1]?.order ?? null,
        children.length,
      );
      const { [item.id]: _removed, ...rest } = items;
      children.forEach((child, i) => {
        rest[child.id] = { ...child, parentId: item.parentId, order: keys[i]! };
      });
      return { ...model, items: rest };
    }

    case 'setArchiveAfter':
      if (model.settings.archiveAfter === intent.archiveAfter) return model;
      return { ...model, settings: { ...model.settings, archiveAfter: intent.archiveAfter } };

    case 'restoreItems': {
      const missing = intent.items.filter((restored) => !items[restored.id]);
      return missing.length ? put(...missing) : model;
    }

    case 'createSpace': {
      if (model.spaces.some((space) => space.id === intent.spaceId)) return model;
      const space: Space = { id: intent.spaceId, name: intent.name };
      if (intent.icon) space.icon = intent.icon;
      const spaces = [...model.spaces];
      spaces.splice(clamp(intent.index, 0, spaces.length), 0, space);
      return { ...model, spaces };
    }

    case 'renameSpace': {
      const name = intent.name.trim();
      return updateSpace(model, intent.spaceId, (space) =>
        name && name !== space.name ? { ...space, name } : space,
      );
    }

    case 'setSpaceIcon':
      return updateSpace(model, intent.spaceId, (space) => {
        const { icon: _old, ...rest } = space;
        if (intent.icon) return { ...rest, icon: intent.icon };
        return space.icon ? rest : space;
      });

    case 'setSpaceTheme':
      return updateSpace(model, intent.spaceId, (space) => {
        const { theme: _old, ...rest } = space;
        if (intent.theme) return { ...rest, theme: intent.theme };
        return space.theme ? rest : space;
      });

    case 'setAppearance':
      if (model.settings.appearance === intent.appearance) return model;
      return { ...model, settings: { ...model.settings, appearance: intent.appearance } };

    case 'setDeveloperMode': {
      const host = intent.host.toLowerCase();
      const sites = model.settings.developerSites;
      if (!host || sites.includes(host) === intent.on) return model;
      const developerSites = intent.on ? [...sites, host] : sites.filter((site) => site !== host);
      return { ...model, settings: { ...model.settings, developerSites } };
    }

    case 'moveSpace': {
      const from = model.spaces.findIndex((space) => space.id === intent.spaceId);
      if (from === -1) return model;
      const spaces = model.spaces.filter((space) => space.id !== intent.spaceId);
      const to = clamp(intent.index, 0, spaces.length);
      if (to === from) return model;
      spaces.splice(to, 0, model.spaces[from]!);
      return { ...model, spaces };
    }

    case 'deleteSpace': {
      if (model.spaces.length <= 1) return model;
      if (!model.spaces.some((space) => space.id === intent.spaceId)) return model;
      return {
        ...model,
        spaces: model.spaces.filter((space) => space.id !== intent.spaceId),
        items: Object.fromEntries(
          Object.entries(items).filter(([, kept]) => kept.spaceId !== intent.spaceId),
        ),
      };
    }

    case 'restoreSpace': {
      let next = model;
      if (!model.spaces.some((space) => space.id === intent.space.id)) {
        const spaces = [...model.spaces];
        spaces.splice(clamp(intent.index, 0, spaces.length), 0, intent.space);
        next = { ...model, spaces };
      }
      const missing = intent.items.filter((restored) => !next.items[restored.id]);
      if (!missing.length) return next;
      return {
        ...next,
        items: { ...next.items, ...Object.fromEntries(missing.map((i) => [i.id, i])) },
      };
    }

    case 'importSidebar': {
      const spaces = [
        ...model.spaces,
        ...intent.spaces.filter((space) => !model.spaces.some((s) => s.id === space.id)),
      ];
      let room =
        FAVORITES_LIMIT - Object.values(items).filter((i) => i.spaceId === FAVORITES_ID).length;
      const added = intent.items.filter((imported) => {
        if (items[imported.id]) return false;
        if (imported.spaceId !== FAVORITES_ID) {
          return spaces.some((space) => space.id === imported.spaceId);
        }
        return imported.kind === 'pin' && imported.parentId === null && room-- > 0;
      });
      if (spaces.length === model.spaces.length && !added.length) return model;
      return {
        ...model,
        spaces,
        items: { ...items, ...Object.fromEntries(added.map((i) => [i.id, i])) },
      };
    }

    case 'moveToSpace': {
      if (!item || (item.kind === 'pin' && item.live)) return model;
      if (intent.spaceId === FAVORITES_ID) {
        const count = Object.values(items).filter((i) => i.spaceId === FAVORITES_ID).length;
        if (item.kind !== 'pin' || item.spaceId === FAVORITES_ID || count >= FAVORITES_LIMIT) {
          return item.spaceId === FAVORITES_ID ? put({ ...item, order: intent.order }) : model;
        }
      } else if (!model.spaces.some((space) => space.id === intent.spaceId)) {
        return model;
      }
      const inside = item.kind === 'folder' ? descendants(model, item.id) : [];
      return put(
        { ...item, spaceId: intent.spaceId, parentId: null, order: intent.order },
        ...inside.map((child) => ({ ...child, spaceId: intent.spaceId })),
      );
    }

    case 'restoreSidebar':
      return { ...intent.model, rev: model.rev };

    case 'closePin':
    case 'resetPin':
    case 'refreshLiveFolder':
    case 'reorderToday':
    case 'archiveTabs':
    case 'restoreArchived':
    case 'forgetArchived':
    case 'moveTabToSpace':
    case 'setActiveSpace':
      return model;
  }
}

/**
 * The session part of an intent that a panel can predict. `windowOf` is a tab's
 * window when known: the service always knows; a panel knows only its own tabs.
 */
export function applySessionIntent(
  session: SessionState,
  intent: Intent,
  windowOf: (tabId: number) => number | undefined = () => undefined,
): SessionState {
  switch (intent.type) {
    case 'pinTab': {
      // Only a Today tab can be pinned: one that closed, or that another
      // panel pinned first, leaves the new pin unopened.
      if (!Object.values(session.orders).some((order) => order.includes(intent.tabId))) {
        return session;
      }
      const orders = Object.fromEntries(
        Object.entries(session.orders).map(([w, order]) => [w, withoutTab(order, intent.tabId)]),
      );
      // A pinned tab belongs to its pin's space, not to a Today.
      const { [intent.tabId]: _today, ...tabSpaces } = session.tabSpaces;
      return {
        ...session,
        orders,
        tabSpaces,
        bindings: { ...session.bindings, [intent.itemId]: intent.tabId },
      };
    }
    case 'unpin':
    case 'closePin': {
      const tabId = session.bindings[intent.itemId];
      if (tabId === undefined) return session;
      const { [intent.itemId]: _unbound, ...bindings } = session.bindings;
      if (intent.type === 'closePin') return { ...session, bindings };
      const key = String(windowOf(tabId) ?? intent.windowId);
      const order = session.orders[key] ?? [];
      const placed =
        intent.todayBeforeTabId === undefined
          ? withTabOnTop(order, tabId)
          : withTabBefore(order, tabId, intent.todayBeforeTabId);
      const tabSpaces = intent.spaceId
        ? { ...session.tabSpaces, [tabId]: intent.spaceId }
        : session.tabSpaces;
      return { ...session, bindings, tabSpaces, orders: { ...session.orders, [key]: placed } };
    }
    case 'reorderToday': {
      const key = String(intent.windowId);
      const order = session.orders[key] ?? [];
      const placed = withTabBefore(order, intent.tabId, intent.beforeTabId);
      if (placed.every((id, i) => id === order[i]) && placed.length === order.length)
        return session;
      return { ...session, orders: { ...session.orders, [key]: placed } };
    }
    case 'archiveTabs': {
      const closed = new Set(intent.tabs.map(({ tabId }) => tabId));
      const orders = Object.fromEntries(
        Object.entries(session.orders).map(([w, order]) => [
          w,
          order.filter((id) => !closed.has(id)),
        ]),
      );
      return { ...session, orders };
    }
    case 'moveTabToSpace': {
      if (session.tabSpaces[intent.tabId] === intent.spaceId) return session;
      // It arrives at the top of the other space's Today.
      const orders = Object.fromEntries(
        Object.entries(session.orders).map(([w, order]) => [
          w,
          order.includes(intent.tabId) ? withTabOnTop(order, intent.tabId) : order,
        ]),
      );
      return {
        ...session,
        orders,
        tabSpaces: { ...session.tabSpaces, [intent.tabId]: intent.spaceId },
      };
    }
    case 'setActiveSpace': {
      const key = String(intent.windowId);
      if (session.activeSpaces[key] === intent.spaceId) return session;
      return { ...session, activeSpaces: { ...session.activeSpaces, [key]: intent.spaceId } };
    }
    case 'deleteSpace': {
      const move = (spaceId: string) =>
        spaceId === intent.spaceId ? intent.fallbackSpaceId : spaceId;
      const { [intent.spaceId]: _gone, ...lastActive } = session.lastActive;
      const tabSpaces = Object.fromEntries(
        Object.entries(session.tabSpaces).map(([tab, space]) => [tab, move(space)]),
      );
      const activeSpaces = Object.fromEntries(
        Object.entries(session.activeSpaces).map(([w, space]) => [w, move(space)]),
      );
      // Tabs the deleted pins had open stay open, in the fallback space's Today.
      return releaseTabs(
        { ...session, lastActive, tabSpaces, activeSpaces },
        intent.itemIds,
        intent.fallbackSpaceId,
        windowOf,
        intent.windowId,
      );
    }
    case 'syncLiveFolder':
      return releaseTabs(session, intent.removedIds, intent.spaceId, windowOf, intent.windowId);
    case 'deleteLiveFolder':
      return releaseTabs(session, intent.itemIds, intent.spaceId, windowOf, intent.windowId);
    case 'restoreSidebar': {
      const spaces = new Set(intent.model.spaces.map((space) => space.id));
      const first = intent.model.spaces[0]!.id;
      const activeSpaces = Object.fromEntries(
        Object.entries(session.activeSpaces).map(([w, space]) => [
          w,
          spaces.has(space) ? space : first,
        ]),
      );
      const shownIn = (windowKey: string) => activeSpaces[windowKey] ?? first;
      // Today tabs whose space is gone go to the space their window shows.
      const windowKeyOf = new Map(
        Object.entries(session.orders).flatMap(([w, order]) => order.map((id) => [id, w] as const)),
      );
      const tabSpaces = Object.fromEntries(
        Object.entries(session.tabSpaces).map(([tabId, space]) => [
          tabId,
          spaces.has(space)
            ? space
            : shownIn(windowKeyOf.get(Number(tabId)) ?? String(intent.windowId)),
        ]),
      );
      // Tabs of pins the copy doesn't have stay open, on top of Today.
      const bindings: Record<string, number> = {};
      const orders = { ...session.orders };
      for (const [itemId, tabId] of Object.entries(session.bindings)) {
        if (intent.model.items[itemId]?.kind === 'pin') {
          bindings[itemId] = tabId;
          continue;
        }
        const key = String(windowOf(tabId) ?? intent.windowId);
        orders[key] = withTabOnTop(orders[key] ?? [], tabId);
        tabSpaces[tabId] = shownIn(key);
      }
      for (const [itemId, tabId] of Object.entries(intent.bindings ?? {})) {
        const inToday = Object.values(orders).some((order) => order.includes(tabId));
        if (!inToday || bindings[itemId] !== undefined) continue;
        if (intent.model.items[itemId]?.kind !== 'pin') continue;
        for (const [w, order] of Object.entries(orders)) orders[w] = withoutTab(order, tabId);
        delete tabSpaces[tabId];
        bindings[itemId] = tabId;
      }
      const lastActive = Object.fromEntries(
        Object.entries(session.lastActive).filter(([space]) => spaces.has(space)),
      );
      return { ...session, bindings, orders, tabSpaces, activeSpaces, lastActive };
    }
    default:
      return session;
  }
}

/** The archive part of an intent. Pure and idempotent, like the others. */
export function applyArchiveIntent(archive: ArchiveState, intent: Intent): ArchiveState {
  switch (intent.type) {
    case 'archiveTabs': {
      const known = new Set(archive.entries.map((entry) => entry.id));
      const added = intent.tabs.map(({ entry }) => entry).filter((entry) => !known.has(entry.id));
      if (!added.length) return archive;
      return { ...archive, entries: [...added, ...archive.entries].slice(0, ARCHIVE_LIMIT) };
    }
    case 'restoreArchived':
    case 'forgetArchived': {
      const gone = new Set(intent.entryIds);
      const entries = archive.entries.filter((entry) => !gone.has(entry.id));
      return entries.length === archive.entries.length ? archive : { ...archive, entries };
    }
    default:
      return archive;
  }
}
