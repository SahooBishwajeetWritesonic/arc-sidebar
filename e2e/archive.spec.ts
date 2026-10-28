import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');

// The harness seeds: Pinned = Gmail (active), Calendar, Dev (Linear, GitHub);
// Today = Engineering Wiki, Figma, chrome.sidePanel docs, YouTube (playing audio).

async function today(page: Page) {
  return panel(page)
    .locator('[data-sidebar] [data-nav-row="tab"]')
    .evaluateAll((elements) =>
      elements.map(
        (el) => el.querySelector('span[class*="title"]')?.textContent?.slice(0, 16) ?? '',
      ),
    );
}

async function ready(page: Page) {
  await page.goto('/');
  await expect(panel(page).locator('[data-nav-row="folder"]')).toHaveCount(1);
  await expect(panel(page).locator('[data-nav-row="tab"]')).toHaveCount(4);
}

test('Clear archives Today except audio, and Undo brings it back in order', async ({ page }) => {
  await ready(page);
  const before = await today(page);
  await panel(page).getByRole('button', { name: 'Clear', exact: true }).click();
  await expect.poll(() => today(page)).toEqual(['Lo-fi beats to c']);
  await expect(panel(page).getByRole('status')).toContainText('Cleared 3 tabs');

  await panel(page).getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => today(page)).toEqual(before);
});

test('a closed Today tab goes to the Archive and reopens from it', async ({ page }) => {
  await ready(page);
  const figma = panel(page).locator('[data-nav-row="tab"]', { hasText: 'Sidebar explorations' });
  await figma.hover();
  await figma.getByRole('button', { name: 'Close tab' }).click();
  await expect.poll(() => today(page)).not.toContain('Sidebar explorat');

  await panel(page).getByRole('button', { name: 'Archive', exact: true }).click();
  const entry = panel(page).locator('[data-archive-entry]', { hasText: 'Sidebar explorations' });
  await expect(entry).toBeVisible();
  await expect(panel(page).getByRole('heading', { name: 'Today' })).toBeVisible();
  await entry.click();
  await expect(entry).toHaveCount(0);

  await panel(page).getByRole('button', { name: 'Back to sidebar' }).click();
  await expect.poll(async () => (await today(page))[0]).toBe('Sidebar explorat');
});

test('auto-archive skips the active tab and tabs playing audio', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Make inactive tabs 13 hours old' }).click();
  await page.getByRole('button', { name: 'Run auto-archive now' }).click();
  await expect.poll(() => today(page)).toEqual(['Lo-fi beats to c']);
  await expect(panel(page).locator('[data-nav-row="pin"]')).toHaveCount(4);
});

test('the archive time follows the setting', async ({ page }) => {
  await ready(page);
  await panel(page).getByRole('button', { name: 'More', exact: true }).click();
  await panel(page).getByRole('menuitemradio', { name: '24 Hours' }).click();
  await page.getByRole('button', { name: 'Make inactive tabs 13 hours old' }).click();
  await page.getByRole('button', { name: 'Run auto-archive now' }).click();
  await page.waitForTimeout(200);
  expect(await today(page)).toHaveLength(4);
});
