import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');
const tiles = (page: Page) => panel(page).locator('[data-favorite-id]');
const today = (page: Page) => panel(page).locator('[data-active-page] [data-nav-row="tab"]');

async function ready(page: Page) {
  await page.goto('/');
  await expect(today(page)).toHaveCount(4);
}

async function favoriteTodayTab(page: Page, title: string) {
  await today(page).filter({ hasText: title }).click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Add to Favorites' }).click();
}

test('adds a Today tab to Favorites, and clicking the tile selects it', async ({ page }) => {
  await ready(page);
  await favoriteTodayTab(page, 'Engineering Wiki');
  await expect(tiles(page)).toHaveCount(1);
  await expect(today(page).filter({ hasText: 'Engineering Wiki' })).toHaveCount(0);

  await tiles(page).first().click();
  await expect(tiles(page).first()).toHaveAttribute('aria-pressed', 'true');
});

test('removing a favorite puts its tab back in Today, with Undo', async ({ page }) => {
  await ready(page);
  await favoriteTodayTab(page, 'Engineering Wiki');
  await expect(tiles(page)).toHaveCount(1);

  await tiles(page).first().click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Remove from Favorites' }).click();
  await expect(tiles(page)).toHaveCount(0);
  await expect(today(page).filter({ hasText: 'Engineering Wiki' })).toHaveCount(1);

  await panel(page).getByRole('button', { name: 'Undo' }).click();
  await expect(tiles(page)).toHaveCount(1);
});

test('favorites stay put when switching spaces', async ({ page }) => {
  await ready(page);
  await favoriteTodayTab(page, 'Engineering Wiki');
  await panel(page).getByRole('button', { name: 'More', exact: true }).click();
  await panel(page).getByRole('menuitem', { name: 'New Space' }).click();
  await panel(page).getByRole('textbox', { name: 'Name' }).press('Enter');
  await expect(panel(page).locator('[data-active-page] [data-nav-row="pin"]')).toHaveCount(0);
  await expect(tiles(page)).toHaveCount(1);
});

async function dragTo(page: Page, from: ReturnType<Page['locator']>, to: { x: number; y: number }) {
  const box = (await from.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 8, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 14 });
  await page.mouse.up();
}

test('dragging a Today tab above the space title favorites it', async ({ page }) => {
  await ready(page);
  const header = (await panel(page)
    .locator('[data-active-page] [data-space-header]')
    .boundingBox())!;
  await dragTo(page, today(page).filter({ hasText: 'Engineering Wiki' }), {
    x: header.x + 60,
    y: header.y + 4,
  });
  await expect(tiles(page)).toHaveCount(1);
  await expect(today(page).filter({ hasText: 'Engineering Wiki' })).toHaveCount(0);
});

test('dragging a favorite into Today un-favorites it', async ({ page }) => {
  await ready(page);
  await favoriteTodayTab(page, 'Engineering Wiki');
  await expect(tiles(page)).toHaveCount(1);
  await tiles(page).first().click(); // open it, so it has a tab to move
  const target = (await today(page).last().boundingBox())!;
  await dragTo(page, tiles(page).first(), { x: target.x + 60, y: target.y + target.height - 4 });
  await expect(tiles(page)).toHaveCount(0);
  await expect(today(page).filter({ hasText: 'Engineering Wiki' })).toHaveCount(1);
});

const pins = (page: Page) => panel(page).locator('[data-active-page] [data-nav-row="pin"]');

test('a favorite shows the unread count its page puts in its title', async ({ page }) => {
  await ready(page);
  await pins(page).filter({ hasText: 'Gmail' }).click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Add to Favorites' }).click();
  await expect(tiles(page)).toHaveCount(1);
  await expect(tiles(page).first().locator('span[class*="unread"]')).toHaveText('3');
});
