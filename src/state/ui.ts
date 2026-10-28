import { create } from 'zustand';

/** Panel-only UI state that isn't saved. */
export const useUi = create<{ editingId: string | null }>()(() => ({ editingId: null }));

export const startEditing = (itemId: string) => useUi.setState({ editingId: itemId });
export const stopEditing = () => useUi.setState({ editingId: null });
