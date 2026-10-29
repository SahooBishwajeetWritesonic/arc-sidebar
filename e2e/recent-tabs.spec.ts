import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');
const switcher = (page: Page) => page.frameLocator('iframe[title="Recent tabs"]');

const row = (page: Page, title: string) =>
  panel(page).locator('[data-active-page] [data-nav-row]', { hasText: title }).first();

/** The harness's ⌃. stands in for the shortcut you'd set; it needs the page to have focus. */
const focusPage = (page: Page) =>
  page.getByRole('heading', { name: 'Arc Sidebar harness' }).click();

/** Used last to first: chrome.sidePanel docs (in front), Sidebar explorations, Engineering Wiki. */
async function ready(page: Page) {
  await page.goto('/');
  await expect(panel(page).locator('[data-active-page] [data-nav-row="tab"]')).toHaveCount(4);
  for (const title of ['Engineering Wiki', 'Sidebar explorations', 'chrome.sidePanel']) {
    await row(page, title).click();
    await expect(row(page, title)).toHaveAttribute('data-selected');
  }
  await focusPage(page);
}

const highlighted = (page: Page) => switcher(page).locator('[role="option"][aria-selected="true"]');

test('holding the shortcut steps through recent tabs; letting go switches', async ({ page }) => {
  await ready(page);
  await page.keyboard.down('Control');
  await page.keyboard.press('Period');
  await expect(page.locator('iframe[title="Recent tabs"]')).toBeVisible();
  await expect(switcher(page).getByRole('option')).toHaveCount(5);
  await expect(switcher(page).getByRole('option').first()).toContainText('chrome.sidePanel');
  // The tab before this one, first.
  await expect(highlighted(page)).toContainText('Sidebar explorations');

  await page.keyboard.press('Period');
  await expect(highlighted(page)).toContainText('Engineering Wiki');
  await page.keyboard.up('Control');
  await expect(page.locator('iframe[title="Recent tabs"]')).toHaveCount(0);
  await expect(row(page, 'Engineering Wiki')).toHaveAttribute('data-selected');
});

test('a quick press switches to the previous tab without showing the list', async ({ page }) => {
  await ready(page);
  await page.keyboard.press('Control+Period');
  await expect(row(page, 'Sidebar explorations')).toHaveAttribute('data-selected');
  await expect(page.locator('iframe[title="Recent tabs"]')).toHaveCount(0);
});

test('W closes the highlighted tab; Esc closes the list and stays put', async ({ page }) => {
  await ready(page);
  await page.keyboard.down('Control');
  await page.keyboard.press('Period');
  await expect(highlighted(page)).toContainText('Sidebar explorations');
  await page.keyboard.press('KeyW');
  await expect(row(page, 'Sidebar explorations')).toHaveCount(0);
  await expect(highlighted(page)).toContainText('Engineering Wiki');

  await page.keyboard.press('Escape');
  await page.keyboard.up('Control');
  await expect(page.locator('iframe[title="Recent tabs"]')).toHaveCount(0);
  await expect(row(page, 'chrome.sidePanel')).toHaveAttribute('data-selected');
});
