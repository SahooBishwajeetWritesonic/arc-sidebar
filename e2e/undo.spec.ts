import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');
const pins = (page: Page) => panel(page).locator('[data-active-page] [data-nav-row="pin"]');

const unpin = async (page: Page, title: string) => {
  await pins(page).filter({ hasText: title }).click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Unpin' }).click();
  await expect(pins(page).filter({ hasText: title })).toHaveCount(0);
};

test('unpinning one tab after another keeps one Undo for both', async ({ page }) => {
  await page.goto('/');
  await expect(pins(page)).toHaveCount(4);
  await unpin(page, 'Google Calendar');
  await expect(panel(page).getByRole('status')).toContainText('Unpinned “Google Calendar');
  await unpin(page, 'My issues');
  await expect(panel(page).getByRole('status')).toContainText('Unpinned 2 tabs');

  await panel(page).getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await expect(pins(page)).toHaveCount(4);
  await expect(pins(page).filter({ hasText: 'Google Calendar' })).toHaveCount(1);
  await expect(pins(page).filter({ hasText: 'My issues' })).toHaveCount(1);
});
