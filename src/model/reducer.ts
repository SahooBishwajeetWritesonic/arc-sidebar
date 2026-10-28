import { generateNKeysBetween } from 'fractional-indexing';
import { withTabBefore, withTabOnTop, withoutTab } from '@/platform/today-order';
import { childrenOf, isWithin } from './tree';
import {
  ARCHIVE_LIMIT,
  type ArchiveState,
  type Intent,
  type Item,
  type SessionState,
  type SidebarModel,
} from './types';

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

    case 'openPin':
    case 'closePin':
    case 'resetPin':
    case 'reorderToday':
    case 'archiveTabs':
    case 'restoreArchived':
    case 'forgetArchived':
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
      return {
        ...session,
        orders,
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
      return { ...session, bindings, orders: { ...session.orders, [key]: placed } };
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
