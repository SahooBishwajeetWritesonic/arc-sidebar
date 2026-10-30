import type { Route } from './types';
import { isSamePage } from './urls';

/**
 * The first Air Traffic Control rule matching a new tab at `url`. "contains" ignores case;
 * "is" takes the address as typed, with or without https://.
 */
export function routeFor(routes: readonly Route[], url: string): Route | undefined {
  const address = url.toLowerCase();
  return routes.find((route) => {
    const text = route.text.trim();
    if (!text) return false;
    if (route.match === 'contains') return address.includes(text.toLowerCase());
    return isSamePage(url, /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  });
}
