import { create } from 'zustand';
import type { Backup, SpaceTheme } from '@/model/types';

export type LibrarySection = 'downloads' | 'archive';

interface UiState {
  editingId: string | null;
  /** 'archive' is the Library open, on `librarySection`. */
  view: 'sidebar' | 'archive';
  librarySection: LibrarySection;
  /** The space whose theme picker is open. */
  themeEditor: string | null;
  /** A theme being edited, shown before it is saved (null: no theme). */
  themePreview: { spaceId: string; theme: SpaceTheme | null } | null;
  /** The "Import from Arc" dialog is open. */
  importing: boolean;
  /** The backups the "Restore Sidebar" dialog offers, while it's open. */
  restoring: Backup[] | null;
  /** "Clear Archive" is asking to be sure. */
  clearingArchive: boolean;
  /** Air Traffic Control's rules are being edited. */
  editingRoutes: boolean;
  /** The Site Search & Shortcuts sheet is open. */
  editingShortcuts: boolean;
  /** The pin Live Calendar is being set up for. */
  liveCalendarFor: string | null;
  /** The command bar is open inside the sidebar. */
  commandBar: boolean;
  /** The selected tab's address, when the URL bar opened the bar to edit it. */
  commandBarAddress: string | null;
}

/** Panel-only UI state that isn't saved. */
export const useUi = create<UiState>()(() => ({
  editingId: null,
  view: 'sidebar',
  librarySection: 'archive',
  themeEditor: null,
  themePreview: null,
  importing: false,
  restoring: null,
  clearingArchive: false,
  editingRoutes: false,
  editingShortcuts: false,
  liveCalendarFor: null,
  commandBar: false,
  commandBarAddress: null,
}));

export const startEditing = (itemId: string) => useUi.setState({ editingId: itemId });
export const stopEditing = () => useUi.setState({ editingId: null });
export const showView = (view: 'sidebar' | 'archive') => useUi.setState({ view });
export const openLibrary = (librarySection: LibrarySection) =>
  useUi.setState({ view: 'archive', librarySection });
export const showLibrarySection = (librarySection: LibrarySection) =>
  useUi.setState({ librarySection });
export const setImporting = (importing: boolean) => useUi.setState({ importing });
export const setRestoring = (restoring: Backup[] | null) => useUi.setState({ restoring });
export const setClearingArchive = (clearingArchive: boolean) => useUi.setState({ clearingArchive });
export const setEditingRoutes = (editingRoutes: boolean) => useUi.setState({ editingRoutes });
export const setEditingShortcuts = (editingShortcuts: boolean) =>
  useUi.setState({ editingShortcuts });
export const setLiveCalendarFor = (liveCalendarFor: string | null) =>
  useUi.setState({ liveCalendarFor });
export const setCommandBar = (commandBar: boolean) =>
  useUi.setState({ commandBar, commandBarAddress: null });
export const toggleCommandBar = () =>
  useUi.setState((state) => ({ commandBar: !state.commandBar, commandBarAddress: null }));
/** Opens the bar on the selected tab's address, as Arc's URL bar and ⌘L do. */
export const editAddress = (url: string) =>
  useUi.setState({ commandBar: true, commandBarAddress: url });
