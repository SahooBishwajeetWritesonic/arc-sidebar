import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');
const button = (page: Page, name: string) => panel(page).getByRole('button', { name, exact: true });
const address = (page: Page) => panel(page).getByRole('button', { name: /^Edit address, / });

/** Turned on from the + menu; Gmail (pinned) is in front, and it follows a link. */
async function withButtons(page: Page) {
  await page.goto('/');
  await expect(panel(page).locator('[data-active-page] [data-nav-row="tab"]')).toHaveCount(4);
  await expect(button(page, 'Back')).toHaveCount(0);
  await button(page, 'More').click();
  await panel(page).getByRole('menuitem', { name: 'Show Back, Forward and Reload' }).click();
  await expect(button(page, 'Back')).toBeVisible();
  await page.getByRole('button', { name: 'Follow a link in the active tab' }).click();
  await expect(address(page)).toHaveAttribute('aria-label', /\/page-\d+/);
}

test('Back and Forward step through the tab’s history', async ({ page }) => {
  await withButtons(page);
  await button(page, 'Back').click();
  await expect(address(page)).toHaveAttribute('aria-label', /\/u\/0\/#inbox$/);
  await button(page, 'Forward').click();
  await expect(address(page)).toHaveAttribute('aria-label', /\/page-\d+/);
});

test('Reload stops the page while it loads', async ({ page }) => {
  await withButtons(page);
  await expect(button(page, 'Reload')).toBeVisible();
  await button(page, 'Reload').click();
  await button(page, 'Stop').click();
  await expect(button(page, 'Reload')).toBeVisible();
});

test('⌘-click on Back opens the page before in a new tab', async ({ page }) => {
  await withButtons(page);
  await button(page, 'Back').click({ modifiers: ['Meta'] });
  const today = panel(page).locator('[data-active-page] [data-nav-row="tab"]');
  await expect(today.filter({ hasText: 'Inbox (3) - Gmail' })).toBeVisible();
  // The pinned tab stays on the page it had gone to.
  const pinned = panel(page).locator('[data-active-page] [data-nav-row="pin"]');
  await expect(pinned.filter({ hasText: 'Another page on' })).toBeVisible();
});

const reloads = (page: Page) =>
  page.evaluate(() => window.harnessPlatform.reloads.map((r) => r.how));

test('the reload menu reloads, hard reloads, or clears the site’s cache first', async ({
  page,
}) => {
  await withButtons(page);
  await button(page, 'Reload Options').click();
  await panel(page)
    .getByRole('menuitem', { name: /^Hard Reload/ })
    .click();
  await expect.poll(() => reloads(page)).toEqual(['hard']);
  await expect(button(page, 'Reload')).toBeVisible();

  // Right-click on Reload opens it too.
  await button(page, 'Reload').click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Clear Site Cache and Reload' }).click();
  await expect.poll(() => reloads(page)).toEqual(['hard', 'clear']);
});

test('Reload shows Stop at once, and Shift-click hard reloads', async ({ page }) => {
  await withButtons(page);
  await button(page, 'Reload').click({ modifiers: ['Shift'] });
  await expect(button(page, 'Stop')).toBeVisible();
  await expect.poll(() => reloads(page)).toEqual(['hard']);
  await expect(button(page, 'Reload')).toBeVisible();
});
