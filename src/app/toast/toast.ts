import { create } from 'zustand';
import { pushUndo, type Undo } from '@/app/undo';

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
  /** Undos of one kind, merged while the toast showed, and how much they add up to. */
  merge?: { key: string; total: number };
  /** What its Undo undoes, which ⌘Z can undo too. */
  undos?: Undo[];
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

export function showToast(message: string, action?: Toast['action'], merge?: Merge, undo?: Undo) {
  const current = useToast.getState().toast;
  const undos = undo ? [undo] : [];
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
        undos: [...(current.undos ?? []), ...undos],
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
      ...(undo && { undos }),
    },
  });
}

/** A toast whose Undo undoes `change`; ⌘Z can undo it too. */
export function showUndoToast(message: string, change: () => void, merge?: Merge) {
  const undo = pushUndo(change);
  showToast(message, { label: 'Undo', run: undo.run }, merge, undo);
}

/** After ⌘Z: a toast with nothing left to undo goes. */
export function dismissUndone() {
  const undos = useToast.getState().toast?.undos;
  if (undos?.length && undos.every((undo) => undo.done)) useToast.setState({ toast: null });
}

export function dismissToast(id: number) {
  if (useToast.getState().toast?.id === id) useToast.setState({ toast: null });
}
