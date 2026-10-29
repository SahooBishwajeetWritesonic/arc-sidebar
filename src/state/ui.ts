import { create } from 'zustand';
import type { Backup, SpaceTheme } from '@/model/types';

interface UiState {
  editingId: string | null;
  view: 'sidebar' | 'archive';
  /** The space whose theme picker is open. */
  themeEditor: string | null;
  /** A theme being edited, shown before it is saved (null: no theme). */
  themePreview: { spaceId: string; theme: SpaceTheme | null } | null;
  /** The "Import from Arc" dialog is open. */
  importing: boolean;
  /** The backups the "Restore Sidebar" dialog offers, while it's open. */
  restoring: Backup[] | null;
  /** The command bar is open inside the sidebar. */
  commandBar: boolean;
}

/** Panel-only UI state that isn't saved. */
export const useUi = create<UiState>()(() => ({
  editingId: null,
  view: 'sidebar',
  themeEditor: null,
  themePreview: null,
  importing: false,
  restoring: null,
  commandBar: false,
}));

export const startEditing = (itemId: string) => useUi.setState({ editingId: itemId });
export const stopEditing = () => useUi.setState({ editingId: null });
export const showView = (view: 'sidebar' | 'archive') => useUi.setState({ view });
export const setImporting = (importing: boolean) => useUi.setState({ importing });
export const setRestoring = (restoring: Backup[] | null) => useUi.setState({ restoring });
export const setCommandBar = (commandBar: boolean) => useUi.setState({ commandBar });
export const toggleCommandBar = () =>
  useUi.setState((state) => ({ commandBar: !state.commandBar }));
