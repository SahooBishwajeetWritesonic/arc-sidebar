import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');

// The harness has five downloads: one coming in, one deleted, one failed.
async function openDownloads(page: Page) {
  await page.goto('/');
  await expect(panel(page).locator('[data-active-page] [data-nav-row="tab"]')).toHaveCount(4);
  await panel(page).getByRole('button', { name: 'Archive', exact: true }).click();
  const library = panel(page).getByRole('region', { name: 'Library' });
  await library.getByRole('button', { name: 'Downloads' }).click();
  await expect(library.getByRole('button', { name: 'Downloads' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  return library.getByRole('region', { name: 'Downloads' });
}

const asked = (page: Page) => page.evaluate(() => window.harnessPlatform.downloadsAsked);

test('Downloads lists them by day; a finished one opens, and shows in Finder', async ({ page }) => {
  const downloads = await openDownloads(page);
  const row = (id: number) => downloads.locator(`[data-download="${id}"]`);
  await expect(downloads.locator('[data-download]')).toHaveCount(5);
  await expect(downloads.getByRole('heading').first()).toHaveText('Today');

  await expect(row(1)).toContainText(/\d+% · \d+ MB of 48 MB/);
  await expect(row(1).getByRole('progressbar')).toBeVisible();
  await expect(row(1)).toContainText('48 MB · figma.com', { timeout: 10_000 });

  await row(2).click();
  await row(3).hover();
  await row(3).getByRole('button', { name: 'Show in Finder' }).click();
  await expect(row(4)).toContainText('Deleted · billing.example.com');
  await expect(row(5)).toContainText('Failed · nodejs.org');
  await row(4).click();
  await row(5).click();
  expect(await asked(page)).toEqual({ opened: [2], shown: [3], folder: 0 });
});

test('Downloads searches, cancels, shows the folder, and clears the list', async ({ page }) => {
  const downloads = await openDownloads(page);
  const row = (id: number) => downloads.locator(`[data-download="${id}"]`);
  await row(1).hover();
  await row(1).getByRole('button', { name: 'Cancel download' }).click();
  await expect(row(1)).toContainText('Cancelled · figma.com');

  await downloads.getByRole('searchbox', { name: 'Search downloads' }).fill('roadmap');
  await expect(downloads.locator('[data-download]')).toHaveCount(1);
  await downloads.getByRole('searchbox', { name: 'Search downloads' }).fill('');

  const options = downloads.getByRole('button', { name: 'Downloads options' });
  await options.click();
  await panel(page).getByRole('menuitem', { name: 'Show Downloads Folder' }).click();
  expect((await asked(page)).folder).toBe(1);
  await options.click();
  await panel(page).getByRole('menuitem', { name: 'Clear List' }).click();
  await expect(downloads.locator('[data-download]')).toHaveCount(0);
  await expect(downloads.getByText('Files you download show up here.')).toBeVisible();
});
