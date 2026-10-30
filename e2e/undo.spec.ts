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

const today = (page: Page) => panel(page).locator('[data-active-page] [data-nav-row="tab"]');
const firstTitles = (page: Page) =>
  today(page).evaluateAll((rows) => rows.map((row) => row.textContent?.slice(0, 12) ?? ''));
/** ⌘Z with the sidebar focused, as from a row. */
const undo = async (page: Page) => {
  await today(page).first().focus();
  await page.keyboard.press('Meta+z');
};

test('⌘Z undoes sidebar changes, latest first: a close, a pin, a move', async ({ page }) => {
  await page.goto('/');
  await expect(today(page)).toHaveCount(4);
  const start = await firstTitles(page);

  // Alt+Down moves Engineering Wiki down one.
  await today(page).first().focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect.poll(() => firstTitles(page)).not.toEqual(start);
  await today(page).filter({ hasText: 'chrome.sidePanel' }).click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Pin Tab' }).click();
  await expect(today(page)).toHaveCount(3);
  await today(page).filter({ hasText: 'Lo-fi' }).getByRole('button', { name: 'Close tab' }).click();
  await expect(today(page)).toHaveCount(2);

  await undo(page);
  await expect(today(page)).toHaveCount(3);
  await undo(page);
  await expect(today(page)).toHaveCount(4);
  await expect(pins(page).filter({ hasText: 'chrome.sidePanel' })).toHaveCount(0);
  await undo(page);
  await expect.poll(() => firstTitles(page)).toEqual(start);
});

test('⌘Z undoes what a toast offers to, and the toast goes', async ({ page }) => {
  await page.goto('/');
  await expect(pins(page)).toHaveCount(4);
  await unpin(page, 'Google Calendar');
  await expect(panel(page).getByRole('status')).toBeVisible();
  await undo(page);
  await expect(pins(page).filter({ hasText: 'Google Calendar' })).toHaveCount(1);
  await expect(panel(page).getByRole('status')).toHaveCount(0);
});
