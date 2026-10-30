import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');
const today = (page: Page) => panel(page).locator('[data-active-page] [data-nav-row="tab"]');
const todaySplits = (page: Page) =>
  panel(page).locator('[data-active-page] [data-nav-row="split"]');
const pinnedSplit = (page: Page) =>
  panel(page).locator('[data-active-page] [data-nav-row="pin"]:has([data-pane])');
const pins = (page: Page) =>
  panel(page).locator('[data-active-page] [data-nav-row="pin"]:not(:has([data-pane]))');

// The harness seeds: Pinned = Gmail, Calendar, Dev (Linear, GitHub);
// Today = Engineering Wiki, Figma, chrome.sidePanel docs, YouTube.

/** Engineering Wiki and Figma side by side in Today, as Chrome's own menu would do it. */
async function split(page: Page) {
  await page.goto('/');
  await expect(today(page)).toHaveCount(4);
  await today(page).filter({ hasText: 'Engineering Wiki' }).click();
  await page.getByRole('button', { name: 'Split the active tab with the next one' }).click();
  await expect(todaySplits(page)).toHaveCount(1);
}

async function pinTheSplit(page: Page) {
  await split(page);
  await todaySplits(page).click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Pin Split' }).click();
  await expect(pinnedSplit(page)).toHaveCount(1);
}

const splitInChrome = (page: Page) =>
  page.evaluate(async () => {
    const tabs = await window.harnessPlatform.queryTabs();
    const [a, b] = ['Engineering Wiki', 'Sidebar explorations'].map((title) =>
      tabs.find((tab) => tab.title.startsWith(title)),
    );
    return a?.splitViewId !== undefined && a.splitViewId === b?.splitViewId;
  });

test('Pin Split pins both tabs as one row, still side by side', async ({ page }) => {
  await pinTheSplit(page);
  await expect(pinnedSplit(page)).toContainText('Engineering Wiki');
  await expect(pinnedSplit(page)).toContainText('Sidebar explorations – Figma');
  await expect(todaySplits(page)).toHaveCount(0);
  await expect(today(page)).toHaveCount(2);
  await expect(pinnedSplit(page)).toHaveAttribute('data-selected', 'true');
  expect(await splitInChrome(page)).toBe(true);
});

test('a closed pinned split opens both, side by side, on the pane pressed', async ({ page }) => {
  await pinTheSplit(page);
  const panes = pinnedSplit(page).locator('[data-pane]');
  for (const i of [1, 0]) await panes.nth(i).getByRole('button', { name: 'Close tab' }).click();
  await expect(pinnedSplit(page).getByRole('button', { name: 'Close tab' })).toHaveCount(0);
  await expect(pinnedSplit(page)).toContainText('Engineering Wiki');

  await panes.nth(1).click();
  await expect(pinnedSplit(page).getByRole('button', { name: 'Close tab' })).toHaveCount(2);
  await expect(panes.nth(1)).toHaveAttribute('data-active', 'true');
  await expect.poll(() => splitInChrome(page)).toBe(true);
  // Opened from Pinned, they stay out of Today.
  await expect(today(page)).toHaveCount(2);
});

test('Unpin Split puts the split back in Today, with one Undo for both', async ({ page }) => {
  await pinTheSplit(page);
  await pinnedSplit(page).click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Unpin Split' }).click();
  await expect(pinnedSplit(page)).toHaveCount(0);
  await expect(todaySplits(page)).toHaveCount(1);
  await expect(panel(page).getByRole('status')).toContainText('Unpinned 2 tabs');

  await panel(page).getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await expect(pinnedSplit(page)).toHaveCount(1);
  await expect(todaySplits(page)).toHaveCount(0);
});

test('dragging a Today split into Pinned pins it there as one', async ({ page }) => {
  await split(page);
  const source = (await todaySplits(page).boundingBox())!;
  const gmail = (await pins(page).filter({ hasText: 'Gmail' }).boundingBox())!;
  await page.mouse.move(source.x + 60, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + 60, source.y + source.height / 2 - 8, { steps: 4 });
  await page.mouse.move(gmail.x + 60, gmail.y + gmail.height * 0.2, { steps: 12 });
  await page.mouse.up();
  await expect(pinnedSplit(page)).toHaveCount(1);
  const first = panel(page).locator('[data-active-page] [data-nav-row]').first();
  await expect(first).toContainText('Engineering Wiki');
  await expect(todaySplits(page)).toHaveCount(0);
});

test('Separate All Tabs leaves two pins of their own', async ({ page }) => {
  await pinTheSplit(page);
  await pinnedSplit(page).click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Separate All Tabs' }).click();
  await expect(pinnedSplit(page)).toHaveCount(0);
  await expect(pins(page).filter({ hasText: 'Engineering Wiki' })).toHaveCount(1);
  await expect(pins(page).filter({ hasText: 'Sidebar explorations' })).toHaveCount(1);
  await expect.poll(() => splitInChrome(page)).toBe(false);
});
