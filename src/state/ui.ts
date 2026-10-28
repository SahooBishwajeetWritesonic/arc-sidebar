import { create } from 'zustand';

/** Panel-only UI state that isn't saved. */
export const useUi = create<{ editingId: string | null; view: 'sidebar' | 'archive' }>()(() => ({
  editingId: null,
  view: 'sidebar',
}));

export const startEditing = (itemId: string) => useUi.setState({ editingId: itemId });
export const stopEditing = () => useUi.setState({ editingId: null });
export const showView = (view: 'sidebar' | 'archive') => useUi.setState({ view });
