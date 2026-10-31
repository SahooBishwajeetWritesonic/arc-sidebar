import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');
const pins = (page: Page) => panel(page).locator('[data-active-page] [data-nav-row="pin"]');
const today = (page: Page) => panel(page).locator('[data-active-page] [data-nav-row="tab"]');
const pin = (page: Page, title: string) => pins(page).filter({ hasText: title }).first();

// The harness seeds: Pinned = Gmail, Calendar, Dev (Linear, GitHub), each open in a tab;
// Today = Engineering Wiki, Figma, chrome.sidePanel docs, YouTube. Gmail is in front.

async function ready(page: Page) {
  await page.goto('/');
  await expect(today(page)).toHaveCount(4);
}

test('× closes a pinned tab and keeps it; then − takes it out of Pinned, with Undo', async ({
  page,
}) => {
  await ready(page);
  const calendar = pin(page, 'Google Calendar');
  await calendar.hover();
  await calendar.getByRole('button', { name: 'Close tab' }).click();
  // Still pinned, closed: − in place of ×.
  await expect(calendar).toBeVisible();
  await expect(calendar.getByRole('button', { name: 'Close tab' })).toHaveCount(0);
  await calendar.hover();
  await calendar.getByRole('button', { name: 'Unpin' }).click();
  await expect(pins(page).filter({ hasText: 'Google Calendar' })).toHaveCount(0);
  // A closed pin leaves no tab behind.
  await expect(today(page)).toHaveCount(4);

  await panel(page).getByRole('button', { name: 'Undo' }).click();
  await expect(pins(page).filter({ hasText: 'Google Calendar' })).toHaveCount(1);
});
