import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');
const FIXTURE = fileURLToPath(new URL('../src/import/fixtures/arc-sidebar.json', import.meta.url));

async function openImport(page: Page) {
  await panel(page).getByRole('button', { name: 'More' }).click();
  await panel(page).getByRole('menuitem', { name: 'Import from Arc…' }).click();
  return panel(page).getByRole('dialog', { name: 'Import from Arc' });
}

const choice = (page: Page, name: string) =>
  panel(page)
    .locator('label')
    .filter({ has: panel(page).getByText(name, { exact: true }) })
    .getByRole('checkbox');

test('imports the chosen Arc spaces and favorites', async ({ page }) => {
  await page.goto('/');
  const dialog = await openImport(page);
  await expect(dialog.getByRole('button', { name: 'Choose file…' })).toBeFocused();
  await dialog.locator('input[type="file"]').setInputFiles(FIXTURE);

  // Spaces from Arc's default profile start checked; Profile 2's doesn't.
  await expect(choice(page, 'Work')).toBeChecked();
  await expect(choice(page, 'Lab')).toBeChecked();
  await expect(choice(page, 'Home')).not.toBeChecked();
  await expect(dialog.getByText('4 tabs, 3 folders')).toBeVisible();
  await expect(dialog.getByText('Left out: 2 notes or Arc pages')).toBeVisible();
  await choice(page, 'Misc').click();
  await expect(choice(page, 'Misc')).not.toBeChecked();

  await dialog.getByRole('button', { name: 'Import' }).click();
  await expect(dialog).toBeHidden();
  await expect(panel(page).getByRole('status')).toHaveText(/Imported 2 spaces and 9 tabs/);
  await expect(
    panel(page).getByRole('navigation', { name: 'Spaces' }).getByRole('button'),
  ).toHaveCount(3);
  await expect(panel(page).locator('[data-favorite-id]')).toHaveCount(3);

  // The same file again has nothing new from those spaces.
  const again = await openImport(page);
  await again.locator('input[type="file"]').setInputFiles(FIXTURE);
  await expect(choice(page, 'Work')).toBeDisabled();
  await expect(again.getByText('Already imported').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(again).toBeHidden();
});

test("says so when the file isn't Arc's", async ({ page }) => {
  await page.goto('/');
  const dialog = await openImport(page);
  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello": "world"}'),
  });
  await expect(dialog.getByRole('alert')).toHaveText(/isn't Arc's sidebar file/);
});
