import { isSelectable, rowKey, selectRange, toggleRow, type RowKey } from '@/state/selection';

/** ⌘- or ⇧-click on `row`: the rows it counts are the ones drawn on the shown space. */
export function selectFrom(row: HTMLElement, key: RowKey, range: boolean) {
  const page = row.closest('[data-active-page]') ?? document;
  const rows = [...page.querySelectorAll<HTMLElement>('[data-nav-row]')].filter(
    (each) => isSelectable(each.dataset.navRow!) && each.dataset.leaving === undefined,
  );
  const keyOf = (each: HTMLElement) => rowKey(each.dataset.navRow!, each.dataset.rowId!);
  const active = rows.find((each) => each.dataset.selected !== undefined);
  const activeKey = active ? keyOf(active) : null;
  if (range) selectRange(rows.map(keyOf), key, activeKey);
  else toggleRow(key, activeKey);
}
