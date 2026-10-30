import { beforeEach, describe, expect, it } from 'vitest';
import { dismissToast, showToast, useToast } from './toast';

const unpinned = (log: string[], name: string) =>
  showToast(
    `Unpinned “${name}”`,
    { label: 'Undo', run: () => log.push(name) },
    { key: 'unpin', amount: 1, message: (total) => `Unpinned ${total} tabs` },
  );

describe('showToast', () => {
  beforeEach(() => useToast.setState({ toast: null }));

  it('merges Undos of one kind into one toast that undoes them all, latest first', () => {
    const log: string[] = [];
    unpinned(log, 'Gmail');
    const first = useToast.getState().toast!;
    unpinned(log, 'Linear');
    const merged = useToast.getState().toast!;
    expect(merged.id).toBe(first.id);
    expect(merged.message).toBe('Unpinned 2 tabs');
    merged.action!.run();
    expect(log).toEqual(['Linear', 'Gmail']);
  });

  it('replaces a toast of another kind, or one that has gone', () => {
    const log: string[] = [];
    showToast('Copied URL');
    unpinned(log, 'Gmail');
    expect(useToast.getState().toast!.message).toBe('Unpinned “Gmail”');
    dismissToast(useToast.getState().toast!.id);
    unpinned(log, 'Linear');
    expect(useToast.getState().toast!.message).toBe('Unpinned “Linear”');
  });
});
