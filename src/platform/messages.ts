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
