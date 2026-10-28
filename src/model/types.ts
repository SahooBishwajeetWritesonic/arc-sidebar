/**
 * The saved sidebar: what survives restarts. Identity is our own ids, never
 * Chrome's tab ids (those change on every restart).
 */
export interface SidebarModel {
  /** Bumped on every write, so panels can tell which writes they have seen. */
  rev: number;
  spaces: Space[];
  items: Record<string, Item>;
  settings: Settings;
}

/** Arc's choices for how long an unviewed Today tab stays before it archives. */
export type ArchiveAfter = '12h' | '24h' | '7d' | '30d';

export const ARCHIVE_AFTER_MS: Record<ArchiveAfter, number> = {
  '12h': 12 * 3600_000,
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
  '30d': 30 * 24 * 3600_000,
};

export interface Settings {
  archiveAfter: ArchiveAfter;
  appearance: Appearance;
}

export const defaultSettings = (): Settings => ({ archiveAfter: '12h', appearance: 'auto' });

export interface Space {
  id: string;
  name: string;
  icon?: SpaceIcon;
  theme?: SpaceTheme;
}

/**
 * How a theme's other colours follow the first (hue offsets in
 * app/theme/engine.ts); 'free' lets each colour move on its own, as in Arc.
 */
export type Harmony =
  'single' | 'analogous' | 'complementary' | 'splitComplementary' | 'triadic' | 'free';

/** A space's colours: Arc's 1–3 colour gradient with intensity and grain. */
export interface SpaceTheme {
  /** 1–3 hex colours, the first one leading. */
  colors: string[];
  harmony: Harmony;
  /** How much colour versus the neutral base, 0.25–0.8. */
  intensity: number;
  /** Grain strength, 0–1 in sixteenths. */
  grain: number;
}

/** Light, dark or following the system; one setting for every space, as in Arc. */
export type Appearance = 'auto' | 'light' | 'dark';

/** An emoji, or one of the sidebar's symbol icons (see app/spaces/icons.ts). */
export type SpaceIcon = { type: 'emoji'; char: string } | { type: 'symbol'; name: string };

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

/**
 * Favorites are pinned tabs in this pseudo-space: shared by every space,
 * icon-only, at most 12 (Arc's limit).
 */
export const FAVORITES_ID = 'favorites';
export const FAVORITES_LIMIT = 12;

export const emptyModel = (): SidebarModel => ({
  rev: 0,
  spaces: [{ id: DEFAULT_SPACE_ID, name: 'Space' }],
  items: {},
  settings: defaultSettings(),
});

/** A Today tab that was archived: auto-archived, cleared or closed. */
export interface ArchiveEntry {
  id: string;
  url: string;
  title: string;
  spaceId: string;
  archivedAt: number;
  reason: 'auto' | 'cleared' | 'closed';
  /** Entries archived together (one Clear) share a batch, so Undo restores them all. */
  batchId: string;
}

/** Newest first. */
export interface ArchiveState {
  rev: number;
  entries: ArchiveEntry[];
}

export const emptyArchive = (): ArchiveState => ({ rev: 0, entries: [] });

/** The most entries the archive keeps; older ones fall off the end. */
export const ARCHIVE_LIMIT = 500;

/** A copy of the saved sidebar from before a change. */
export interface Backup {
  savedAt: number;
  model: SidebarModel;
}

/**
 * Per browser session (cleared when Chrome restarts): Today order per window
 * and which pinned item is open in which tab.
 */
export interface SessionState {
  rev: number;
  /** Window id → Today tab ids, top first (all spaces; each space shows its own). */
  orders: Record<string, number[]>;
  /** Pin id → tab id. */
  bindings: Record<string, number>;
  /** Today tab id → space id. Pinned tabs belong to their pin's space instead. */
  tabSpaces: Record<string, string>;
  /** Window id → the space it shows. */
  activeSpaces: Record<string, string>;
  /** Space id → the tab last used there, re-selected when switching back. */
  lastActive: Record<string, number>;
}

export const emptySession = (): SessionState => ({
  rev: 0,
  orders: {},
  bindings: {},
  tabSpaces: {},
  activeSpaces: {},
  lastActive: {},
});

/** Fills in fields that sessions saved by older versions don't have. */
export const normalizeSession = (session: Partial<SessionState>): SessionState => ({
  ...emptySession(),
  ...session,
});

/** Per space, its Today tabs' URLs, top first, to re-match after a Chrome restart. */
export type TodaySnapshot = Record<string, string[]>;

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
      /** The space whose Today the tab goes to (the pin's space). */
      spaceId?: string;
      /** Where the tab goes in Today: before this tab, null for the end, omitted for the top. */
      todayBeforeTabId?: number | null;
    }
  | { type: 'reorderToday'; windowId: number; tabId: number; beforeTabId: number | null }
  /** Closes Today tabs and records them in the archive (entries made by the panel). */
  | { type: 'archiveTabs'; windowId: number; tabs: { tabId: number; entry: ArchiveEntry }[] }
  /** Reopens archived tabs at the top of Today, in their original order. */
  | { type: 'restoreArchived'; windowId: number; entryIds: string[] }
  | { type: 'forgetArchived'; entryIds: string[] }
  | { type: 'setArchiveAfter'; archiveAfter: ArchiveAfter }
  /** Puts back items that were removed (undo). */
  | { type: 'restoreItems'; items: Item[] }
  | { type: 'createSpace'; spaceId: string; name: string; index: number; icon?: SpaceIcon }
  | { type: 'renameSpace'; spaceId: string; name: string }
  | { type: 'setSpaceIcon'; spaceId: string; icon: SpaceIcon | null }
  | { type: 'setSpaceTheme'; spaceId: string; theme: SpaceTheme | null }
  | { type: 'setAppearance'; appearance: Appearance }
  | { type: 'moveSpace'; spaceId: string; index: number }
  /**
   * Removes a space and its pins and folders (`itemIds`). Its Today tabs, and
   * any tabs its pins had open, move to `fallbackSpaceId`'s Today.
   */
  | {
      type: 'deleteSpace';
      spaceId: string;
      fallbackSpaceId: string;
      itemIds: string[];
      windowId: number;
    }
  | { type: 'restoreSpace'; space: Space; index: number; items: Item[] }
  /** Moves a pinned item (and a folder's contents) to the top level of another space. */
  | { type: 'moveToSpace'; itemId: string; spaceId: string; order: string }
  | { type: 'moveTabToSpace'; tabId: number; spaceId: string }
  /** Shows a space in a window; `openNewTab` when it has no tab to select. */
  | { type: 'setActiveSpace'; windowId: number; spaceId: string; openNewTab?: boolean }
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
  | { type: 'move'; itemId: string; parentId: string | null; order: string; spaceId?: string }
  | { type: 'deleteFolder'; itemId: string };

/** The service's answer: the revisions at which the intent was applied. */
export interface IntentResult {
  modelRev: number;
  sessionRev: number;
  archiveRev: number;
}
