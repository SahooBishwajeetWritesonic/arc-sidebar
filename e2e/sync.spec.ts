import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');
const more = (page: Page) => panel(page).getByRole('button', { name: 'More', exact: true });
const item = (page: Page, name: string) => panel(page).getByRole('menuitem', { name });

test('sync turns on and off from the + menu, saying what it carries', async ({ page }) => {
  await page.goto('/');
  await expect(panel(page).locator('[data-active-page] [data-nav-row="tab"]')).toHaveCount(4);
  await more(page).click();
  await item(page, 'Sync Spaces Across Computers').click();
  await expect(panel(page).getByRole('status')).toContainText('Spaces now sync through Chrome');

  await more(page).click();
  await item(page, 'Stop Syncing Spaces').click();
  await more(page).click();
  await expect(item(page, 'Sync Spaces Across Computers')).toBeVisible();
});
