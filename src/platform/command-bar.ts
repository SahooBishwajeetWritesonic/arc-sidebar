import type { Command } from '@/command/types';

/**
 * Messages that open and run the command bar, over the page (in an overlay frame) or in the
 * sidebar. Chosen commands always run in the sidebar, with its toasts and Undo.
 */
export type CommandBarMessage =
  /** Background → sidebars: is this window's sidebar open, and does it have focus? */
  | { kind: 'command-bar:ping'; windowId: number }
  /** Background → sidebar: open or close the bar inside the sidebar. */
  | { kind: 'command-bar:toggle'; windowId: number; requestId: string }
  /** Bar → sidebar: run this. */
  | { kind: 'command-bar:run'; windowId: number; command: Command }
  /** Bar → background: the token it was opened with, to prove the page didn't frame it. */
  | { kind: 'command-bar:hello'; token: string }
  /** Background → the page's overlay script: open or close the bar over the page. */
  | { kind: 'command-bar:overlay'; token: string };

export interface PingReply {
  focused: boolean;
}

export interface HelloReply {
  ok: boolean;
  windowId?: number;
  sidebarOpen?: boolean;
}

export interface CommandBarRequest {
  id: string;
  windowId: number;
  at: number;
}

/** How long a request waits for a sidebar that is still starting. */
export const REQUEST_TTL_MS = 5000;

/** What the bar's frame posts to the overlay script in the page. */
export const CLOSE_MESSAGE = { arcCommandBar: 'close' } as const;
