import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');
const pinned = (page: Page) => panel(page).locator('[data-active-page] [data-nav-row="pin"]');
const folder = (page: Page) =>
  panel(page).locator('[data-active-page] [data-nav-row="folder"]', { hasText: 'Pull Requests' });
const inFolder = async (page: Page) => {
  const id = await folder(page).getAttribute('data-row-id');
  return panel(page)
    .locator(`[data-active-page] [data-nav-row="pin"][data-parent-id="${id}"]`)
    .allTextContents();
};
const todayTitles = (page: Page) =>
  panel(page).locator('[data-active-page] [data-nav-row="tab"]').allTextContents();
const harness = (page: Page) => page.getByRole('button', { name: 'Open a pull request' });

// The fake github.com has four open pull requests: two of yours (one a
// draft) in acme/web, and review requests in acme/api and acme/design.

async function ready(page: Page) {
  await page.goto('/');
  await expect(panel(page).locator('[data-active-page] [data-nav-row="tab"]')).toHaveCount(4);
}

async function withFolder(page: Page) {
  await ready(page);
  await harness(page).click();
  await expect.poll(() => inFolder(page)).toHaveLength(4);
}

async function filter(page: Page, ...path: string[]) {
  await folder(page).click({ button: 'right' });
  for (const name of path.slice(0, -1)) {
    await panel(page).getByRole('menuitem', { name, exact: true }).hover();
  }
  await panel(page)
    .getByRole('menuitemcheckbox', { name: path.at(-1)!, exact: true })
    .click();
  await closeMenus(page);
}

/** Escape out of the submenu and the menu, and let them finish closing. */
async function closeMenus(page: Page) {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(panel(page).getByRole('menu')).toHaveCount(0);
}

test('opening a pull request makes the Pull Requests folder, newest first', async ({ page }) => {
  await ready(page);
  await expect(folder(page)).toHaveCount(0);
  await harness(page).click();
  await expect
    .poll(() => inFolder(page))
    .toEqual([
      'Keep the sidebar open across restarts',
      'Rate-limit the search endpoint per workspace',
      'Draft: try a denser tab row',
      'New space icons',
    ]);
});

test('its filters: drafts, review requests and one repository', async ({ page }) => {
  await withFolder(page);
  // The submenu stays open, so several can be ticked in a row.
  await folder(page).click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Pull Requests', exact: true }).hover();
  const tick = (name: string) => panel(page).getByRole('menuitemcheckbox', { name, exact: true });
  await tick('Drafts').click();
  await expect.poll(() => inFolder(page)).toHaveLength(3);
  await expect(tick('Drafts')).toHaveAttribute('aria-checked', 'false');
  await tick('Review Requests').click();
  await expect.poll(() => inFolder(page)).toEqual(['Keep the sidebar open across restarts']);
  await closeMenus(page);
  await filter(page, 'Pull Requests', 'Review Requests');
  await expect.poll(() => inFolder(page)).toHaveLength(3);
  await filter(page, 'Pull Requests', 'acme/design');
  await expect.poll(() => inFolder(page)).toEqual(['New space icons']);
  // The other repositories are still offered, and All Repositories goes back.
  await folder(page).click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Pull Requests', exact: true }).hover();
  await expect(panel(page).getByRole('menuitemcheckbox', { name: 'acme/web' })).toBeVisible();
  await panel(page).getByRole('menuitemcheckbox', { name: 'All Repositories' }).click();
  await expect.poll(() => inFolder(page)).toHaveLength(3);
});

test('a new pull request peeks out of the closed folder until it’s opened', async ({ page }) => {
  await withFolder(page);
  await folder(page).click();
  await expect.poll(() => inFolder(page)).toEqual([]);
  await page.getByRole('button', { name: 'Someone asks for a review' }).click();
  await expect.poll(() => inFolder(page)).toEqual(['Review me: change 2000']);
  await pinned(page).filter({ hasText: 'Review me' }).click();
  await expect(pinned(page).filter({ hasText: 'Review me' })).toHaveAttribute('data-selected');
  // Once you've moved on it tucks away like any other closed-folder tab.
  await panel(page).locator('[data-nav-row="tab"]', { hasText: 'Engineering Wiki' }).click();
  await expect.poll(() => inFolder(page)).toEqual([]);
});

test('Refresh asks GitHub again at once, with a spinner meanwhile', async ({ page }) => {
  await withFolder(page);
  await page.evaluate(() => window.harnessPlatform.requestReview(false));
  await page.waitForTimeout(400);
  expect(await inFolder(page)).toHaveLength(4);
  await folder(page).click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Refresh' }).click();
  await expect(folder(page).locator('[class*="spinner"]')).toHaveCount(1);
  await expect.poll(() => inFolder(page)).toHaveLength(5);
  await expect(folder(page).locator('[class*="spinner"]')).toHaveCount(0);
});

test('a merged pull request leaves; its open tab goes to the top of Today', async ({ page }) => {
  await withFolder(page);
  const row = pinned(page).filter({ hasText: 'Keep the sidebar open' });
  await row.click();
  await expect(row).toHaveAttribute('data-selected');
  const before = (await todayTitles(page)).length;
  await page.getByRole('button', { name: 'Merge the newest' }).click();
  await expect.poll(() => inFolder(page)).toHaveLength(3);
  await expect.poll(async () => (await todayTitles(page)).length).toBe(before + 1);
  expect((await todayTitles(page))[0]).toContain('Keep the sidebar open across restarts');
});

test('signed out, it offers to sign in and keeps what it had', async ({ page }) => {
  await withFolder(page);
  await page.getByRole('button', { name: 'Sign out of GitHub' }).click();
  const signIn = panel(page).getByRole('option', { name: 'Sign in to GitHub' });
  await expect(signIn).toBeVisible();
  await expect.poll(() => inFolder(page)).toHaveLength(4);
  await signIn.click();
  await expect.poll(async () => (await todayTitles(page))[0]).toBe('github.com');
  await page.getByRole('button', { name: 'Sign in to GitHub' }).click();
  await expect(signIn).toHaveCount(0);
});

test('deleted, it stays gone until made again from the + menu', async ({ page }) => {
  await withFolder(page);
  await folder(page).click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Delete Live Folder' }).click();
  await expect(folder(page)).toHaveCount(0);
  await panel(page).getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => inFolder(page)).toHaveLength(4);
  await folder(page).click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Delete Live Folder' }).click();
  await expect(folder(page)).toHaveCount(0);
  await harness(page).click();
  await page.waitForTimeout(800);
  await expect(folder(page)).toHaveCount(0);
  await panel(page).getByRole('button', { name: 'More' }).click();
  await panel(page).getByRole('menuitem', { name: 'New GitHub Live Folder' }).click();
  await expect.poll(() => inFolder(page)).toHaveLength(4);
});
