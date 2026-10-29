import { siteOf } from '@/model/urls';

/**
 * Arc's Peek and Little Arc as Chrome popup windows. A page script sends links that should peek
 * to the background, which opens and closes the windows and moves their tabs into the window.
 */

export type LinkChoice = 'peek' | 'tab';

/** A window with no tab strip: a Peek over the window, or a small Little Arc. */
export type FloatingKind = 'peek' | 'little';

export type PeekMessage =
  /** Page → background: what is this tab? Answers its PeekRole. */
  | { kind: 'peek:hello' }
  /** Page → background: open this link in a Peek, or in a tab. */
  | { kind: 'peek:open'; url: string; as: LinkChoice }
  /** A Peek's page → background: Esc closes it. */
  | { kind: 'peek:close' }
  /** A Peek's or Little Arc's page → background: ⌘O keeps it, as a tab in the window. */
  | { kind: 'peek:keep' }
  /** Sidebar → background: this tab, or a new one on this page, in a Little Arc. */
  | ({ kind: 'peek:little'; windowId: number } & ({ tabId: number } | { url: string }));

/** Background → a page: whether it's a pinned tab or Favorite, or in a Peek or Little Arc. */
export interface PeekRole {
  kind: 'peek:role';
  pinned: boolean;
  floating: FloatingKind | null;
}

/** How long a new Peek ignores its window taking focus back, which Chrome can do as it opens. */
export const PEEK_SETTLE_MS = 600;

/**
 * Peeks to close when a window takes focus: those over it, like a click outside Arc's Peek.
 * Focus leaving Chrome or going to another window keeps them; a Little Arc stays until closed.
 */
export function peeksClosedBy(
  floating: Record<string, { kind: FloatingKind; from: number; openedAt: number }>,
  focusedWindowId: number,
  now: number,
): number[] {
  return Object.entries(floating)
    .filter(
      ([, window]) =>
        window.kind === 'peek' &&
        window.from === focusedWindowId &&
        now - window.openedAt >= PEEK_SETTLE_MS,
    )
    .map(([id]) => Number(id));
}

/** Sites whose links open in a tab rather than a Peek, as Arc does for meetings. */
const MEETINGS = /^(meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|([\w-]+\.)*zoom\.us)$/;

/**
 * Arc's rules: Shift-click peeks at any page. In a pinned tab or Favorite, other sites' links peek
 * (meeting links open a tab) so the tab stays on its site. Anything else is left to Chrome.
 */
export function linkChoice(
  from: string,
  to: string,
  { shift, pinned }: { shift: boolean; pinned: boolean },
): LinkChoice | null {
  if (!/^https?:\/\//i.test(to)) return null;
  if (shift) return 'peek';
  if (!pinned || siteOf(from) === siteOf(to)) return null;
  return MEETINGS.test(new URL(to).hostname) ? 'tab' : 'peek';
}
