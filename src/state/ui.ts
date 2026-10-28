import { create } from 'zustand';
import type { SpaceTheme } from '@/model/types';

interface UiState {
  editingId: string | null;
  view: 'sidebar' | 'archive';
  /** The space whose theme picker is open. */
  themeEditor: string | null;
  /** A theme being edited, shown before it is saved (null: no theme). */
  themePreview: { spaceId: string; theme: SpaceTheme | null } | null;
  /** The "Import from Arc" dialog is open. */
  importing: boolean;
}

/** Panel-only UI state that isn't saved. */
export const useUi = create<UiState>()(() => ({
  editingId: null,
  view: 'sidebar',
  themeEditor: null,
  themePreview: null,
  importing: false,
}));

export const startEditing = (itemId: string) => useUi.setState({ editingId: itemId });
export const stopEditing = () => useUi.setState({ editingId: null });
export const showView = (view: 'sidebar' | 'archive') => useUi.setState({ view });
export const setImporting = (importing: boolean) => useUi.setState({ importing });
