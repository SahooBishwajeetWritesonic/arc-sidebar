import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
  /** Undos of one kind, merged while the toast showed, and how much they add up to. */
  merge?: { key: string; total: number };
}

/**
 * Undos of one kind in a row merge into one toast that undoes them all, latest first.
 * `amount` is what this one adds; `message` says the total.
 */
export interface Merge {
  key: string;
  amount: number;
  message: (total: number) => string;
}

/** One toast at a time; a new one replaces the old, or merges into it. */
export const useToast = create<{ toast: Toast | null }>()(() => ({ toast: null }));

let nextId = 1;

export function showToast(message: string, action?: Toast['action'], merge?: Merge) {
  const current = useToast.getState().toast;
  if (merge && action && current?.action && current.merge?.key === merge.key) {
    // The same toast, so it stays put; its time starts again.
    const earlier = current.action.run;
    const total = current.merge.total + merge.amount;
    useToast.setState({
      toast: {
        id: current.id,
        message: merge.message(total),
        action: {
          label: action.label,
          run: () => {
            action.run();
            earlier();
          },
        },
        merge: { key: merge.key, total },
      },
    });
    return;
  }
  useToast.setState({
    toast: {
      id: nextId++,
      message,
      action,
      ...(merge && { merge: { key: merge.key, total: merge.amount } }),
    },
  });
}

export function dismissToast(id: number) {
  if (useToast.getState().toast?.id === id) useToast.setState({ toast: null });
}
