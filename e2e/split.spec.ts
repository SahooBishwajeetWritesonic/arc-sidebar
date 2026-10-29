import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');
const today = (page: Page) => panel(page).locator('[data-active-page] [data-nav-row="tab"]');
const splits = (page: Page) => panel(page).locator('[data-active-page] [data-nav-row="split"]');
const row = (page: Page, text: string) => today(page).filter({ hasText: text });

// The harness seeds one space: Pinned = Gmail (active), Calendar, Dev (Linear,
// GitHub); Today = Engineering Wiki, Figma, chrome.sidePanel docs, YouTube.

async function ready(page: Page) {
  await page.goto('/');
  await expect(today(page)).toHaveCount(4);
}

/** Engineering Wiki and Figma side by side, as Chrome's own menu would do it. */
async function splitInChrome(page: Page) {
  await row(page, 'Engineering Wiki').click();
  await page.getByRole('button', { name: 'Split the active tab with the next one' }).click();
  await expect(splits(page)).toHaveCount(1);
}

test('two tabs Chrome splits show as one row, and pressing a pane selects that tab', async ({
  page,
}) => {
  await ready(page);
  await splitInChrome(page);
  const split = splits(page);
  await expect(split).toContainText('Engineering Wiki');
  await expect(split).toContainText('Sidebar explorations – Figma');
  await expect(today(page)).toHaveCount(2);
  await expect(split).toHaveAttribute('data-selected', 'true');

  const panes = split.locator('[data-pane]');
  await panes.nth(1).click();
  await expect(panes.nth(1)).toHaveAttribute('data-active', 'true');
  await expect(panes.nth(0)).not.toHaveAttribute('data-active');
});

test('each pane closes its own tab; Close Split archives both; Separate makes them rows', async ({
  page,
}) => {
  await ready(page);
  await splitInChrome(page);
  await splits(page).click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Separate All Tabs' }).click();
  await expect(splits(page)).toHaveCount(0);
  await expect(today(page)).toHaveCount(4);

  await splitInChrome(page);
  const panes = splits(page).locator('[data-pane]');
  await panes.nth(1).hover();
  await panes.nth(1).getByRole('button', { name: 'Close tab' }).click();
  await expect(splits(page)).toHaveCount(0);
  await expect(row(page, 'Engineering Wiki')).toHaveCount(1);
  await expect(row(page, 'Figma')).toHaveCount(0);

  await row(page, 'Engineering Wiki').click();
  await page.getByRole('button', { name: 'Split the active tab with the next one' }).click();
  await splits(page).click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Close Split' }).click();
  await expect(splits(page)).toHaveCount(0);
  await expect(today(page)).toHaveCount(1);
  await panel(page).getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(panel(page).getByText('Engineering Wiki')).toBeVisible();
  await expect(panel(page).getByText('chrome.sidePanel', { exact: false })).toBeVisible();
});

test('dropping a tab on the middle of another splits them, on the side it was dropped', async ({
  page,
}) => {
  await ready(page);
  const source = (await row(page, 'YouTube').boundingBox())!;
  const target = (await row(page, 'Engineering Wiki').boundingBox())!;
  await page.mouse.move(source.x + 60, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + 70, source.y + 10, { steps: 4 });
  await page.mouse.move(target.x + target.width * 0.25, target.y + target.height / 2, {
    steps: 8,
  });
  await expect(row(page, 'Engineering Wiki')).toHaveAttribute('data-split-drop', 'left');
  await page.mouse.up();

  await expect(splits(page)).toHaveCount(1);
  const panes = splits(page).locator('[data-pane]');
  await expect(panes.nth(0)).toContainText('YouTube');
  await expect(panes.nth(1)).toContainText('Engineering Wiki');
  // The dragged tab is shown, and the row keeps its audio button.
  await expect(panes.nth(0)).toHaveAttribute('data-active', 'true');
  await expect(splits(page).getByRole('button', { name: 'Mute tab' })).toBeVisible();
});

test('the command bar adds a split with a picked tab and removes it', async ({ page }) => {
  await ready(page);
  await row(page, 'Engineering Wiki').click();
  await page.getByRole('heading', { name: 'Arc Sidebar harness' }).click();
  await page.keyboard.press('Alt+KeyT');
  const bar = page.frameLocator('iframe[title="Command bar"]');
  const field = bar.getByRole('combobox');
  await field.pressSequentially('/add split');
  await field.press('Enter');
  await expect(bar.getByText('Split with')).toBeVisible();
  await field.pressSequentially('figma');
  await expect(bar.locator('[aria-selected="true"]')).toContainText('Figma');
  await field.press('Enter');
  await expect(splits(page)).toHaveCount(1);
  const panes = splits(page).locator('[data-pane]');
  await expect(panes.nth(0)).toContainText('Engineering Wiki');
  await expect(panes.nth(1)).toContainText('Figma');

  await page.getByRole('heading', { name: 'Arc Sidebar harness' }).click();
  await page.keyboard.press('Alt+KeyT');
  await field.pressSequentially('/remove split');
  await field.press('Enter');
  await expect(splits(page)).toHaveCount(0);
});
