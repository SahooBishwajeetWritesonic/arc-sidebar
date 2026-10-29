import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');

// The harness seeds: Pinned = Gmail, Calendar, Dev (Linear, GitHub), Dev open.

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
