import { browser, type Browser } from 'wxt/browser';
import type { Space } from '@/model/types';
import { copyLinks, selectionOf } from './copy';
import { addKeepItem } from './peek';
import type { SidebarService } from './service';

const COPY = 'copy-url';
const MARKDOWN = 'copy-url-markdown';
const PIN = 'pin-tab';
const FAVORITE = 'favorite-tab';
const MOVE = 'move-to-space';
const SPACE = 'space:';

let building: Promise<void> = Promise.resolve();
let built = '';

/**
 * Arc's tab actions in Chrome's tab right-click menu. Building clears every menu, so it
 * re-adds the page menu's Open in Tab for Peeks too.
 */
export function buildTabMenu(spaces: readonly Space[]): Promise<void> {
  const key = JSON.stringify(spaces.map((space) => [space.id, space.name]));
  if (key === built) return building;
  built = key;
  building = building.then(async () => {
    await browser.contextMenus.removeAll();
    addKeepItem();
    const contexts: [`${Browser.contextMenus.ContextType}`] = ['tab'];
    const item = (properties: Browser.contextMenus.CreateProperties) =>
      browser.contextMenus.create({ contexts, ...properties });
    item({ id: COPY, title: 'Copy URL' });
    item({ id: MARKDOWN, title: 'Copy URL as Markdown' });
    item({ id: 'copy-separator', type: 'separator' });
    item({ id: PIN, title: 'Pin Tab' });
    item({ id: FAVORITE, title: 'Add to Favorites' });
    if (spaces.length < 2) return;
    item({ id: MOVE, title: 'Move to Space' });
    for (const space of spaces) {
      item({ id: `${SPACE}${space.id}`, parentId: MOVE, title: space.name });
    }
  });
  return building;
}

/** Acts on the tab and the others selected with it. */
export async function onTabMenuClick(
  info: Browser.contextMenus.OnClickData,
  tab: Browser.tabs.Tab | undefined,
  service: SidebarService,
) {
  if (!tab) return;
  const id = String(info.menuItemId);
  if (id === COPY || id === MARKDOWN) return copyLinks(tab, id === MARKDOWN);
  const tabIds = (await selectionOf(tab))
    .map((selected) => selected.id)
    .filter((tabId) => tabId !== undefined);
  if (id === PIN) return service.pinTabs(tabIds);
  if (id === FAVORITE) return service.favoriteTabs(tabIds);
  if (id.startsWith(SPACE)) return service.moveTabsToSpace(tabIds, id.slice(SPACE.length));
}
