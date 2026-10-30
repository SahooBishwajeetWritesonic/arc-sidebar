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
  /**
   * Arc makes the GitHub Live Folder the first time you open a pull request.
   * Deleting the folder turns that off until you make one again.
   */
  githubFolder: boolean;
  /**
   * Hostnames in Arc's Developer Mode: full address in the URL bar, host under tab titles.
   * Arc turns it on for local servers by itself.
   */
  developerSites: string[];
  /**
   * Arc's Back, Forward and Reload above the URL bar. Off at first: Chrome's
   * toolbar has its own beside the panel.
   */
  navButtons: boolean;
  /** Arc's Air Traffic Control: new tabs at matching addresses open in a chosen space. */
  routes: Route[];
}

/** One of Air Traffic Control's rules. The first that matches a new tab decides its space. */
export interface Route {
  id: string;
  /** "contains": the address has the text in it; "is": it's that page. */
  match: 'contains' | 'is';
  text: string;
  spaceId: string;
}

export const defaultSettings = (): Settings => ({
  archiveAfter: '12h',
  appearance: 'auto',
  githubFolder: true,
  developerSites: ['localhost', '127.0.0.1'],
  navButtons: false,
  routes: [],
});

export interface Space {
  id: string;
  name: string;
  icon?: SpaceIcon;
  theme?: SpaceTheme;
  /** Arc's caret on the space's name folds its Pinned section away. */
  pinnedCollapsed?: true;
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
  /**
   * Arc's pinned Split View: the partner pin, the first in order on the left. Counts only
   * while each names the other and they share a place (see tree.ts partnerOf).
   */
  pair?: string;
  /** Arc's custom tab icon, in place of the favicon. A favorited split's is its left pin's. */
  icon?: SpaceIcon;
  /** Put here by a Live Folder, which takes it out again when the pull request closes. */
  live?: LivePin;
}

export interface FolderItem extends ItemBase {
  kind: 'folder';
  name: string;
  collapsed: boolean;
  /** Arc's Change Icon: one of the icons spaces use, shown in place of the folder. */
  icon?: SpaceIcon;
  /** A folder that fills itself. */
  live?: LiveFolder;
}

export interface GitHubFilters {
  createdByMe: boolean;
  reviewRequests: boolean;
  drafts: boolean;
  /** "owner/name" each; none means every repository. */
  repos: string[];
}

export const defaultGitHubFilters = (): GitHubFilters => ({
  createdByMe: true,
  reviewRequests: true,
  drafts: true,
  repos: [],
});

/** Your open GitHub pull requests: the one source Arc shipped. */
export interface LiveFolder {
  source: 'github';
  filters: GitHubFilters;
  /**
   * The filters it was last filled with (see filtersKey). PRs arriving while they're unchanged
   * are new; those a filter change brings in aren't.
   */
  filledFor?: string;
  /** Where your open pull requests are, whatever the filters: the repository choices. */
  repos?: string[];
  /** GitHub said nobody was signed in, the last time it was asked. */
  signedOut?: true;
}

export interface LivePin {
  /** "owner/name". */
  repo: string;
  number: number;
  draft: boolean;
  /** When the pull request was opened (ISO); the folder lists the newest first. */
  created: string;
  /** Whether its checks passed or failed, shown on its icon as on Arc's. */
  ci?: 'success' | 'failure';
  /**
   * Arrived while the folder was closed and not opened yet. A closed folder
   * still shows these under it: Arc "peeks out" new pull requests.
   */
  unseen?: true;
}

export const LIVE_FOLDER_NAME = 'Pull Requests';

export type Item = PinItem | FolderItem;

export const DEFAULT_SPACE_ID = 'default';

/**
 * Favorites are pinned tabs in this pseudo-space: shared by every space,
 * icon-only, at most 12 (Arc's limit).
 */
export const FAVORITES_ID = 'favorites';
export const FAVORITES_LIMIT = 12;

/**
 * Fills in settings added since the model was saved. The service writes them back only on
 * its next change, so panels reading the saved copy fill them in too.
 */
export const normalizeModel = (model: SidebarModel): SidebarModel => ({
  ...model,
  settings: { ...defaultSettings(), ...model.settings },
});

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
  /** Taken before an import or a restore; hourly copies have none. */
  reason?: 'import' | 'restore';
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
  /**
   * Today tab id → the name it was given (Arc's Rename on a Today tab). A
   * pinned tab's name is its pin's customTitle instead.
   */
  tabTitles: Record<string, string>;
}

export const emptySession = (): SessionState => ({
  rev: 0,
  orders: {},
  bindings: {},
  tabSpaces: {},
  activeSpaces: {},
  lastActive: {},
  tabTitles: {},
});

/** Fills in fields that sessions saved by older versions don't have. */
export const normalizeSession = (session: Partial<SessionState>): SessionState => ({
  ...emptySession(),
  ...session,
});

/**
 * What was open before Chrome quit, re-matched to restored tabs after a restart: each
 * space's Today URLs, top first, and the page each open pin was on.
 */
export interface RestoreSnapshot {
  today: Record<string, string[]>;
  /** Space id → the names renamed Today tabs had, at the same places as `today`. */
  titles?: Record<string, (string | null)[]>;
  pins: Record<string, string>;
  /** 0 when there is no snapshot yet (first run, or one saved before pins were kept). */
  takenAt: number;
}

export const emptySnapshot = (): RestoreSnapshot => ({ today: {}, pins: {}, takenAt: 0 });

/**
 * Each open tab's window, latest URL and title. Chrome's onRemoved gives only an id, so a
 * closed tab is archived from this; the window picks which Today an unpinned tab goes to.
 */
export type TabDetails = Record<string, { url: string; title: string; windowId: number }>;

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
      /** Pinned as one of a split: the pin it's split with. */
      pair?: string;
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
  /** Names a Today tab; null gives it back the page's title. */
  | { type: 'renameTab'; tabId: number; title: string | null }
  /** Closes Today tabs and records them in the archive (entries made by the panel). */
  | { type: 'archiveTabs'; windowId: number; tabs: { tabId: number; entry: ArchiveEntry }[] }
  /**
   * Reopens archived tabs in Today, in their original order: at the top, or
   * above `beforeTabId` (null: at the end) to put them back where they were.
   */
  | { type: 'restoreArchived'; windowId: number; entryIds: string[]; beforeTabId?: number | null }
  | { type: 'forgetArchived'; entryIds: string[] }
  | { type: 'setArchiveAfter'; archiveAfter: ArchiveAfter }
  /** Puts back items that were removed (undo). */
  | { type: 'restoreItems'; items: Item[] }
  | { type: 'createSpace'; spaceId: string; name: string; index: number; icon?: SpaceIcon }
  | { type: 'renameSpace'; spaceId: string; name: string }
  | { type: 'setSpaceIcon'; spaceId: string; icon: SpaceIcon | null }
  | { type: 'setSpaceTheme'; spaceId: string; theme: SpaceTheme | null }
  | { type: 'setPinnedCollapsed'; spaceId: string; collapsed: boolean }
  | { type: 'setAppearance'; appearance: Appearance }
  | { type: 'setDeveloperMode'; host: string; on: boolean }
  | { type: 'setNavButtons'; on: boolean }
  /** Air Traffic Control's rules, as edited; ones with no text are dropped. */
  | { type: 'setRoutes'; routes: Route[] }
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
  /** Adds imported spaces (after the others) and items; anything already there is kept. */
  | { type: 'importSidebar'; spaces: Space[]; items: Item[] }
  /**
   * Replaces the sidebar with a backup or export. Tabs whose pin or space is gone go to Today;
   * `bindings` (from Undo) gives pins back their tabs still in Today.
   */
  | {
      type: 'restoreSidebar';
      model: SidebarModel;
      windowId: number;
      bindings?: Record<string, number>;
    }
  /** Moves a pinned item (and a folder's contents) to the top level of another space. */
  | { type: 'moveToSpace'; itemId: string; spaceId: string; order: string }
  | { type: 'moveTabToSpace'; tabId: number; spaceId: string }
  /** Shows a space in a window; `openNewTab` when it has no tab to select. */
  | { type: 'setActiveSpace'; windowId: number; spaceId: string; openNewTab?: boolean }
  | { type: 'openPin'; itemId: string; windowId: number }
  | { type: 'closePin'; itemId: string }
  | { type: 'resetPin'; itemId: string }
  | { type: 'unpairPins'; itemIds: [string, string] }
  | { type: 'replacePinUrl'; itemId: string; url: string; title: string }
  /**
   * Pins a page that isn't open (Paste URL as New Tab in a folder, or an Option-drag copy).
   * Without a title, its address is its title until the page is opened.
   */
  | {
      type: 'addPin';
      itemId: string;
      spaceId: string;
      parentId: string | null;
      order: string;
      url: string;
      title?: string;
      customTitle?: string;
      icon?: SpaceIcon;
    }
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
  | { type: 'setFolderIcon'; itemId: string; icon: SpaceIcon | null }
  | { type: 'setPinIcon'; itemId: string; icon: SpaceIcon | null }
  /**
   * Copies a folder and its contents just below it; `ids` maps each original id to its copy's.
   * Live Folders and their pull requests aren't copied.
   */
  | { type: 'duplicateFolder'; itemId: string; ids: Record<string, string> }
  | { type: 'move'; itemId: string; parentId: string | null; order: string; spaceId?: string }
  | { type: 'deleteFolder'; itemId: string }
  /** Makes the GitHub Live Folder, and lets Arc make it again after a delete. */
  | { type: 'createLiveFolder'; itemId: string; spaceId: string; order: string }
  | { type: 'setLiveFilters'; itemId: string; filters: GitHubFilters }
  /** Asks GitHub again now. The service answers once the folder is up to date. */
  | { type: 'refreshLiveFolder'; itemId: string }
  /**
   * The service's Live Folder refresh: new, changed and closed pull requests. A closed one's
   * open tab goes to the top of Today in the folder's space.
   */
  | {
      type: 'syncLiveFolder';
      itemId: string;
      items: PinItem[];
      removedIds: string[];
      signedOut: boolean;
      /** Every repository with an open pull request, before the repository filter. */
      repos: string[];
      spaceId: string;
      windowId: number;
    }
  /**
   * Deletes a Live Folder with what it holds (`itemIds`), and stops Arc
   * making it again. Open tabs go to the top of Today.
   */
  | {
      type: 'deleteLiveFolder';
      itemId: string;
      itemIds: string[];
      spaceId: string;
      windowId: number;
    };

/** The service's answer: the revisions at which the intent was applied. */
export interface IntentResult {
  modelRev: number;
  sessionRev: number;
  archiveRev: number;
}
