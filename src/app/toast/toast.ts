import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

export const useToast = create<{ toast: Toast | null }>()(() => ({ toast: null }));

let nextId = 1;

export function showToast(message: string, action?: Toast['action']) {
  useToast.setState({ toast: { id: nextId++, message, action } });
}

export function dismissToast(id: number) {
  if (useToast.getState().toast?.id === id) useToast.setState({ toast: null });
}
