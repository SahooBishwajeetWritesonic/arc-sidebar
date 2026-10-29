import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');
const player = (page: Page) => panel(page).getByRole('region', { name: 'Playing' });
const row = (page: Page, text: string) =>
  panel(page).locator('[data-active-page] [data-nav-row="tab"]').filter({ hasText: text });

// The harness's YouTube tab plays a playlist; Gmail is the tab shown at start.

async function ready(page: Page) {
  await page.goto('/');
  await expect(row(page, 'YouTube')).toHaveCount(1);
}

test('a tab playing sound gets a player while you’re on another tab', async ({ page }) => {
  await ready(page);
  await expect(player(page)).toContainText('Lo-fi beats to code to');
  await row(page, 'YouTube').click();
  await expect(player(page)).toHaveCount(0);
  await row(page, 'Engineering Wiki').click();
  await expect(player(page)).toBeVisible();
  await player(page).getByRole('button', { name: 'Lo-fi beats to code to' }).click();
  await expect(row(page, 'YouTube')).toHaveAttribute('data-selected', 'true');
});

test('the player pauses, plays, skips and mutes the tab', async ({ page }) => {
  await ready(page);
  await player(page).getByRole('button', { name: 'Pause' }).click();
  await expect(player(page).getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  // The tab goes quiet, and the player stays so it can play again.
  await expect(row(page, 'YouTube').getByRole('button', { name: 'Mute tab' })).toHaveCount(0);
  await player(page).getByRole('button', { name: 'Play', exact: true }).click();
  await expect(player(page).getByRole('button', { name: 'Pause' })).toBeVisible();

  await player(page).getByRole('button', { name: 'Next track' }).click();
  await expect(player(page)).toContainText('Rainy day in Tokyo');
  await expect(row(page, 'Rainy day in Tokyo')).toHaveCount(1);
  await player(page).getByRole('button', { name: 'Previous track' }).click();
  await expect(player(page)).toContainText('Lo-fi beats to code to');

  await player(page).getByRole('button', { name: 'Mute', exact: true }).click();
  await expect(player(page).getByRole('button', { name: 'Unmute' })).toBeVisible();
  await expect(row(page, 'YouTube').getByRole('button', { name: 'Unmute tab' })).toBeVisible();
});

test('a dismissed player comes back when its tab next starts playing', async ({ page }) => {
  await ready(page);
  await player(page).hover();
  await player(page).getByRole('button', { name: 'Close player' }).click();
  await expect(player(page)).toHaveCount(0);

  const id = Number(await row(page, 'YouTube').getAttribute('data-row-id'));
  await page.evaluate((tabId) => window.harnessPlatform.mediaCommand(tabId, 'pause'), id);
  await expect(row(page, 'YouTube').getByRole('button', { name: 'Mute tab' })).toHaveCount(0);
  await expect(player(page)).toHaveCount(0);
  await page.evaluate((tabId) => window.harnessPlatform.mediaCommand(tabId, 'play'), id);
  await expect(player(page)).toBeVisible();
});
