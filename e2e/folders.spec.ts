import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');

// The harness seeds: Pinned = Gmail, Calendar, Dev (Linear, GitHub), Dev open.

/** The sidebar's rows, top to bottom, as "kind:depth:title". */
async function rows(page: Page) {
  return panel(page)
    .locator('[data-active-page] [data-nav-row]')
    .evaluateAll((elements) =>
      elements.map((el) => {
        const element = el as HTMLElement;
        const title = element.querySelector('span[class*="title"]')?.textContent ?? '';
        return `${element.dataset.navRow}:${element.dataset.depth ?? 0}:${title.slice(0, 18)}`;
      }),
    );
}

async function ready(page: Page) {
  await page.goto('/');
  await expect(panel(page).locator('[data-active-page] [data-nav-row="tab"]')).toHaveCount(4);
}

const dev = (page: Page) =>
  panel(page).locator('[data-active-page] [data-nav-row="folder"]', { hasText: 'Dev' }).first();

const item = (page: Page, name: string) => panel(page).getByRole('menuitem', { name, exact: true });
const choose = (page: Page, name: string) => item(page, name).click();
/** Submenus open on hover, as on a Mac. */
const into = (page: Page, name: string) => item(page, name).hover();

test('Change Icon shows the chosen icon in place of the folder, until it’s removed', async ({
  page,
}) => {
  await ready(page);
  await dev(page).click({ button: 'right' });
  await into(page, 'Change Icon');
  await into(page, 'Emoji');
  await choose(page, '🚀');
  await expect(dev(page).locator('span[class*="folderIcon"]')).toHaveText('🚀');
  // Once the menu has faded out.
  await expect(panel(page).getByRole('menu')).toHaveCount(0);

  await dev(page).click({ button: 'right' });
  await into(page, 'Change Icon');
  await choose(page, 'Remove Icon');
  await expect(dev(page).locator('span[class*="folderIcon"]')).toHaveText('');
  await expect(dev(page).locator('span[class*="folderIcon"] svg')).toHaveCount(2);
});

test('Duplicate puts a copy of the folder and what’s in it just below it', async ({ page }) => {
  await ready(page);
  const open = await panel(page).getByRole('button', { name: 'Close tab' }).count();
  await dev(page).click({ button: 'right' });
  await choose(page, 'Duplicate');
  await expect
    .poll(() => rows(page))
    .toEqual([
      'pin:0:Inbox (3) - Gmail',
      'pin:0:Google Calendar - ',
      'folder:0:Dev',
      'pin:1:My issues · Linear',
      'pin:1:Pull requests · Gi',
      'folder:0:Dev',
      'pin:1:My issues · Linear',
      'pin:1:Pull requests · Gi',
      'newtab:0:New Tab',
      'tab:0:Engineering Wiki',
      'tab:0:Sidebar exploratio',
      'tab:0:chrome.sidePanel |',
      'tab:0:Lo-fi beats to cod',
    ]);
  // The copies aren't open: only the originals have their tabs.
  await expect(panel(page).getByRole('button', { name: 'Close tab' })).toHaveCount(open);
});
