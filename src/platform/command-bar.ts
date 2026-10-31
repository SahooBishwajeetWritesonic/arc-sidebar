import type { Command } from '@/command/types';
import type { Appearance } from '@/model/types';

/** Shared by the bar's frame and its page (page.css), or Chrome paints the frame opaque. */
export const FRAME_SCHEME = 'light';

/**
 * Messages that open and run the command bar, over the page (in an overlay frame) or in the
 * sidebar. Chosen commands always run in the sidebar, with its toasts and Undo.
 */
export type CommandBarMessage =
  /** Background → sidebars: is this window's sidebar open, and does it have focus? */
  | { kind: 'command-bar:ping'; windowId: number }
  /** Background → sidebar: open or close the bar there (with `address` to edit the tab's). */
  | { kind: 'command-bar:toggle'; windowId: number; requestId: string; address?: string }
  /** Bar → sidebar: run this. */
  | { kind: 'command-bar:run'; windowId: number; command: Command }
  /** Bar → background: the token it was opened with, to prove the page didn't frame it. */
  | { kind: 'command-bar:hello'; token: string }
  /**
   * Background → overlay script: open or close the bar over the page, or with `switcher` the
   * recent tabs (replies SwitcherReply). `look` and `address` draw the field while the bar loads.
   */
  | {
      kind: 'command-bar:overlay';
      token: string;
      switcher?: boolean;
      look?: CommandLook;
      address?: string;
    };

/** How the bar looks in this window: the Appearance setting, and its space's accent. */
export interface CommandLook {
  appearance: Appearance;
  accent: string;
  /** Per preferred scheme: only the page knows which applies. */
  card: Record<'light' | 'dark', { background: string; scheme: 'light' | 'dark' }>;
}

/** What was typed into the stand-in before the bar was drawn, and whether Return was pressed. */
export interface Typed {
  text: string;
  start: number;
  end: number;
  submit: boolean;
}

/** Between the bar's frame and the page around it, as window messages. */
export type CommandBarPost =
  | typeof CLOSE_MESSAGE
  /** Frame → page: drawn, its field focused. */
  | { arcCommandBar: 'ready' }
  /** Page → frame: what was typed into the stand-in, to carry on from. */
  | ({ arcCommandBar: 'typed' } & Typed)
  /** Frame → page: it has that; the stand-in can go if nothing more was typed. */
  | { arcCommandBar: 'carried' };

/** The overlay script's answer to opening the recent tabs. */
export type SwitcherReply =
  | 'opened'
  /** They were open: it stepped to the next one. */
  | 'next'
  /** The shortcut's keys were let go before they could show: switch to the previous tab now. */
  | 'quick';

/** Between the recent tabs' frame and the page around it, as window messages. */
export type SwitcherPost =
  /** Frame → page: drawn. Is the shortcut still held? */
  | { arcSwitcher: 'ready' }
  /** Page → frame: whether it is. Let go already, the frame switches at once. */
  | { arcSwitcher: 'held'; held: boolean }
  /** Page → frame: the shortcut again, so the next tab down. */
  | { arcSwitcher: 'next' };

export interface PingReply {
  focused: boolean;
}

export interface HelloReply {
  ok: boolean;
  windowId?: number;
  sidebarOpen?: boolean;
  /** Opened to edit the tab's address (Arc's ⌘L), starting from this. */
  address?: string;
  /** Opened as the recent tabs (Arc's Ctrl-Tab), not the bar. */
  switcher?: boolean;
}

export interface CommandBarRequest {
  id: string;
  windowId: number;
  at: number;
  address?: string;
}

/** How long a request waits for a sidebar that is still starting. */
export const REQUEST_TTL_MS = 5000;

/** What the bar's frame posts to the overlay script in the page. */
export const CLOSE_MESSAGE = { arcCommandBar: 'close' } as const;
