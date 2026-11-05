/** Chrome's address bar scopes: @tabs, @history, then Tab, searches only that. */
export type Scope = 'tabs' | 'history' | 'archive';

export const SCOPE_NAMES: Record<Scope, string> = {
  tabs: 'Tabs',
  history: 'History',
  archive: 'Archive',
};

/** "@t" is Tabs. */
export function scopeFor(typed: string): Scope | undefined {
  const text = typed.trim().toLowerCase();
  if (!text.startsWith('@') || text.length < 2) return undefined;
  const found = (Object.keys(SCOPE_NAMES) as Scope[]).filter((scope) =>
    scope.startsWith(text.slice(1)),
  );
  return found.length === 1 ? found[0] : undefined;
}
