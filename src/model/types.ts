/**
 * The saved sidebar: what survives restarts. Identity is our own ids, never
 * Chrome's tab ids (those change on every restart).
 */
export interface SidebarModel {
  /** Bumped on every write, so panels can tell which writes they have seen. */
  rev: number;
  spaces: Space[];
  items: Record<string, Item>;
}

export interface Space {
  id: string;
  name: string;
}

interface ItemBase {
  id: string;
  spaceId: string;
  /** Folder id, or null for the top of the Pinned section. */
  parentId: string | null;
  /** Fractional index among siblings. */
  order: string;
}

/** A pinned tab: Arc's "app + bookmark hybrid" that remembers its URL. */
export interface PinItem extends ItemBase {
  kind: 'pin';
  url: string;
  title: string;
  customTitle?: string;
}

export interface FolderItem extends ItemBase {
  kind: 'folder';
  name: string;
  collapsed: boolean;
}

export type Item = PinItem | FolderItem;

export const DEFAULT_SPACE_ID = 'default';

export const emptyModel = (): SidebarModel => ({
  rev: 0,
  spaces: [{ id: DEFAULT_SPACE_ID, name: 'Space' }],
  items: {},
});

/**
 * Per browser session (cleared when Chrome restarts): Today order per window
 * and which pinned item is open in which tab.
 */
export interface SessionState {
  rev: number;
  /** Window id → Today tab ids, top first. */
  orders: Record<string, number[]>;
  /** Pin id → tab id. */
  bindings: Record<string, number>;
}

export const emptySession = (): SessionState => ({ rev: 0, orders: {}, bindings: {} });

/** Every change to the sidebar, sent from a panel to the service. */
export type Intent =
  | {
      type: 'pinTab';
      itemId: string;
      tabId: number;
      spaceId: string;
      parentId: string | null;
      order: string;
      url: string;
      title: string;
    }
  | {
      type: 'unpin';
      itemId: string;
      windowId: number;
      /** Where the tab goes in Today: before this tab, null for the end, omitted for the top. */
      todayBeforeTabId?: number | null;
    }
  | { type: 'reorderToday'; windowId: number; tabId: number; beforeTabId: number | null }
  | { type: 'openPin'; itemId: string; windowId: number }
  | { type: 'closePin'; itemId: string }
  | { type: 'resetPin'; itemId: string }
  | { type: 'replacePinUrl'; itemId: string; url: string; title: string }
  | { type: 'rename'; itemId: string; title: string | null }
  | {
      type: 'createFolder';
      itemId: string;
      spaceId: string;
      parentId: string | null;
      order: string;
      name: string;
      /** Items to move into the new folder, in order. */
      childIds?: string[];
    }
  | { type: 'setFolderCollapsed'; itemId: string; collapsed: boolean }
  | { type: 'move'; itemId: string; parentId: string | null; order: string }
  | { type: 'deleteFolder'; itemId: string };

/** The service's answer: the revisions at which the intent was applied. */
export interface IntentResult {
  modelRev: number;
  sessionRev: number;
}
