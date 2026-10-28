import { generateNKeysBetween } from 'fractional-indexing';
import { withTabBefore, withTabOnTop, withoutTab } from '@/platform/today-order';
import { childrenOf, descendants, isWithin } from './tree';
import {
  ARCHIVE_LIMIT,
  type ArchiveState,
  type Intent,
  type Item,
  type SessionState,
  type SidebarModel,
  type Space,
} from './types';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

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
      if (item) return model;
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
      const folder: Item = {
        kind: 'folder',
        id: intent.itemId,
        spaceId: intent.spaceId,
        parentId: intent.parentId,
        order: intent.order,
        name: intent.name,
        collapsed: false,
      };
      const moved = (intent.childIds ?? [])
        .map((id) => items[id])
        .filter((child): child is Item => child !== undefined);
      const keys = generateNKeysBetween(null, null, moved.length);
      return put(
        folder,
        ...moved.map((child, i) => ({ ...child, parentId: folder.id, order: keys[i]! })),
      );
    }

    case 'setFolderCollapsed':
      if (item?.kind !== 'folder' || item.collapsed === intent.collapsed) return model;
      return put({ ...item, collapsed: intent.collapsed });

    case 'move':
      if (!item) return model;
      if (intent.parentId && isWithin(model, intent.parentId, item.id)) return model;
      return put({ ...item, parentId: intent.parentId, order: intent.order });

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

    case 'moveToSpace': {
      if (!item || !model.spaces.some((space) => space.id === intent.spaceId)) return model;
      const inside = item.kind === 'folder' ? descendants(model, item.id) : [];
      return put(
        { ...item, spaceId: intent.spaceId, parentId: null, order: intent.order },
        ...inside.map((child) => ({ ...child, spaceId: intent.spaceId })),
      );
    }

    case 'openPin':
    case 'closePin':
    case 'resetPin':
    case 'reorderToday':
    case 'archiveTabs':
    case 'restoreArchived':
    case 'forgetArchived':
    case 'moveTabToSpace':
    case 'setActiveSpace':
      return model;
  }
}

/** The session part of an intent that a panel can predict. */
export function applySessionIntent(session: SessionState, intent: Intent): SessionState {
  switch (intent.type) {
    case 'pinTab': {
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
      const key = String(intent.windowId);
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
      // Tabs the deleted pins had open stay open, in the fallback space's Today.
      const removed = new Set(intent.itemIds);
      const bindings: Record<string, number> = {};
      const released: number[] = [];
      for (const [itemId, tabId] of Object.entries(session.bindings)) {
        if (removed.has(itemId)) released.push(tabId);
        else bindings[itemId] = tabId;
      }
      for (const tabId of released) tabSpaces[tabId] = intent.fallbackSpaceId;
      const key = String(intent.windowId);
      const order = released.reduceRight(withTabOnTop, session.orders[key] ?? []);
      return {
        ...session,
        lastActive,
        bindings,
        tabSpaces,
        orders: released.length ? { ...session.orders, [key]: order } : session.orders,
        activeSpaces: Object.fromEntries(
          Object.entries(session.activeSpaces).map(([w, space]) => [w, move(space)]),
        ),
      };
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
