import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');
const today = (page: Page) => panel(page).locator('[data-active-page] [data-nav-row="tab"]');
const ARC_FILE = fileURLToPath(new URL('../src/import/fixtures/arc-sidebar.json', import.meta.url));

// The harness seeds: Pinned = Gmail, Calendar, Dev (Linear, GitHub);
// Today = Engineering Wiki, Figma, chrome.sidePanel docs, YouTube.

async function ready(page: Page) {
  await page.goto('/');
  await expect(today(page)).toHaveCount(4);
}

async function pinWiki(page: Page) {
  await today(page).filter({ hasText: 'Engineering Wiki' }).click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Pin Tab' }).click();
  await expect(today(page).filter({ hasText: 'Engineering Wiki' })).toHaveCount(0);
}

async function more(page: Page, item: string) {
  await panel(page).getByRole('button', { name: 'More' }).click();
  await panel(page).getByRole('menuitem', { name: item }).click();
}

async function openRestore(page: Page) {
  await more(page, 'Restore Sidebar…');
  return panel(page).getByRole('dialog', { name: 'Restore sidebar' });
}

test('restores the backup from before a change, keeping its tab open, with Undo', async ({
  page,
}) => {
  await ready(page);
  await pinWiki(page);

  const dialog = await openRestore(page);
  // The newest backup that differs from now is chosen, ready to restore.
  const backup = dialog.getByRole('radio', { name: /Today at .*1 space, 4 tabs/ });
  await expect(backup).toBeChecked();
  await expect(dialog.getByRole('button', { name: 'Restore' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Restore' }).click();
  await expect(dialog).toBeHidden();
  await expect(panel(page).getByRole('status')).toHaveText(/Sidebar restored/);
  await expect(today(page).filter({ hasText: 'Engineering Wiki' })).toHaveCount(1);

  // Undo brings the pin back, bound to its tab again (only an open pin can close its tab).
  await panel(page).getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await expect(today(page).filter({ hasText: 'Engineering Wiki' })).toHaveCount(0);
  const pin = panel(page).locator('[data-nav-row="pin"]', { hasText: 'Engineering Wiki' });
  await expect(pin.getByRole('button', { name: 'Close tab' })).toHaveCount(1);
});

test('restores a file saved with Export Sidebar', async ({ page }, testInfo) => {
  await ready(page);
  const downloading = page.waitForEvent('download');
  await more(page, 'Export Sidebar…');
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^arc-sidebar-\d{4}-\d{2}-\d{2}\.json$/);
  const file = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(file);
  await pinWiki(page);

  const dialog = await openRestore(page);
  await dialog.locator('input[type="file"]').setInputFiles(file);
  await expect(dialog.getByRole('radio', { name: /arc-sidebar-.*1 space, 4 tabs/ })).toBeChecked();
  await dialog.getByRole('button', { name: 'Restore' }).click();
  await expect(today(page).filter({ hasText: 'Engineering Wiki' })).toHaveCount(1);
});

test('says which files it can restore', async ({ page }) => {
  await ready(page);
  const dialog = await openRestore(page);
  await expect(dialog.getByText(/No backups yet/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Open file…' })).toBeFocused();

  await dialog.locator('input[type="file"]').setInputFiles(ARC_FILE);
  await expect(dialog.getByRole('alert')).toHaveText(/Use Import from Arc instead/);
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello": "world"}'),
  });
  await expect(dialog.getByRole('alert')).toHaveText(/isn't a sidebar export/);
  await expect(dialog.getByRole('button', { name: 'Restore' })).toBeDisabled();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(panel(page).getByRole('button', { name: 'More' })).toBeFocused();
});
