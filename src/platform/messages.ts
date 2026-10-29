import type { Area } from './capture-tool';

/**
 * The background can't reach the clipboard, so an offscreen page writes it. Notes show over the
 * page, or in the sidebar when Chrome keeps scripts out of the page.
 */
export type NoteMessage =
  /** Background → its offscreen page: put this on the clipboard. Answers true once it's there. */
  | { kind: 'clipboard:write'; text: string }
  /** Background → the page's overlay script: show a short note over the page. */
  | { kind: 'page:note'; text: string }
  /** Background → sidebars: show it as a toast instead. */
  | { kind: 'sidebar:note'; windowId: number; text: string };

/** The capture tool → background: a picture of this part of the page, as it is now. */
export interface CaptureMessage {
  kind: 'capture:shot';
  area: Area;
  /** The page's width in CSS pixels, to scale the area to the picture's pixels. */
  viewportWidth: number;
}

/** A PNG as base64, or nothing when Chrome wouldn't capture the page. */
export interface CaptureReply {
  png?: string;
}
