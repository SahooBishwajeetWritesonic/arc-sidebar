import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');

const row = (page: Page, title: string) =>
  panel(page).locator('[data-active-page] [data-nav-row]', { hasText: title }).first();

test('⌘⌥-click moves a Today tab into Little Arc, out of the sidebar', async ({ page }) => {
  await page.goto('/');
  await expect(panel(page).locator('[data-active-page] [data-nav-row="tab"]')).toHaveCount(4);
  await row(page, 'Lo-fi beats').click({ modifiers: ['Meta', 'Alt'] });
  await expect(panel(page).locator('[data-active-page] [data-nav-row="tab"]')).toHaveCount(3);
  await expect(row(page, 'Lo-fi beats')).toHaveCount(0);
  // Nothing was selected or opened on the way.
  await expect(panel(page).locator('[data-multi-selected]')).toHaveCount(0);
  await expect(row(page, 'Inbox (3) - Gmail')).toHaveAttribute('data-selected');
});
