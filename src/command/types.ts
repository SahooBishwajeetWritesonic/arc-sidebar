import type { Appearance } from '@/model/types';

/** What the command bar can do to the current tab or the sidebar (Arc's action names). */
export type ActionId =
  | 'pinTab'
  | 'unpinTab'
  | 'favoriteTab'
  | 'unfavoriteTab'
  | 'moveToSpace'
  | 'archiveTab'
  | 'closeTab'
  | 'copyUrl'
  | 'copyMarkdown'
  | 'duplicateTab'
  | 'resetTab'
  | 'replacePin'
  | 'renameTab'
  | 'splitView'
  | 'removeSplit'
  | 'nextSpace'
  | 'previousSpace'
  | 'newSpace'
  | 'newFolder'
  | 'clearToday'
  | 'pasteUrl'
  | 'resetSpace'
  | 'togglePinned'
  | 'revealTab'
  | 'viewArchive'
  | 'viewDownloads'
  | 'clearArchive'
  | 'editTheme'
  | 'editShortcuts'
  | 'addSiteSearch'
  | 'appearance'
  | 'restoreSidebar'
  | 'exportSidebar'
  | 'importArc';

/**
 * What a row does when chosen. Plain data, so the bar (in its own frame over
 * the page) can hand it to the sidebar to run there, with its toasts and Undo.
 */
export type Command =
  | { type: 'openUrl'; url: string }
  | { type: 'search'; text: string }
  | { type: 'switchToTab'; tabId: number }
  | { type: 'openPin'; itemId: string }
  | { type: 'switchSpace'; spaceId: string }
  | {
      type: 'action';
      action: ActionId;
      /** For "Move to [Space]". */
      spaceId?: string;
      appearance?: Appearance;
      /** What was typed for an action that asks for a name ("Rename Current Tab…"). */
      text?: string;
      /** The tab or address picked for an action that asks for one ("Add Split View…"). */
      tabId?: number;
      url?: string;
    };

/** A row in the command bar. */
export interface Result {
  /** Stable while typing, so a row that stays isn't rebuilt. */
  key: string;
  command: Command;
  title: string;
  /** Quieter text after the title: the address, or the space a tab is in. */
  detail?: string;
  /** The page whose favicon the row shows. */
  url?: string;
  /** What Enter does, at the row's end ("Switch to Tab"). */
  hint: string;
  /** An action that asks for a name first; this is what the field starts with. */
  prompt?: { label: string; initial: string };
  /** An action that asks for a tab or an address first. */
  pick?: { label: string };
}
