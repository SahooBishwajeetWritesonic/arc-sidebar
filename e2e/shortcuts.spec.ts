import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');
const bar = (page: Page) => page.frameLocator('iframe[title="Command bar"]');
const field = (page: Page) => bar(page).getByRole('combobox');
const selected = (page: Page) => bar(page).locator('[role="option"][aria-selected="true"]');
const todayTitles = (page: Page) =>
  panel(page).locator('[data-active-page] [data-nav-row="tab"]').allTextContents();

async function openBar(page: Page) {
  await page.getByRole('heading', { name: 'Arc Sidebar harness' }).click();
  await page.keyboard.press('Alt+KeyT');
  await expect(field(page)).toBeFocused();
}

test('shortcuts made in the sheet work in the command bar', async ({ page }) => {
  await page.goto('/');
  await expect(panel(page).locator('[data-active-page] [data-nav-row="tab"]')).toHaveCount(4);

  await panel(page).getByRole('button', { name: 'More', exact: true }).click();
  await panel(page).getByRole('menuitem', { name: 'Site Search & Shortcuts…' }).click();
  const dialog = panel(page).getByRole('dialog', { name: 'Site Search & Shortcuts' });
  const first = (part: string) => dialog.getByRole('textbox', { name: `Shortcut 1: ${part}` });

  // A link, with a blank for the issue number.
  await dialog.getByRole('button', { name: 'Add Shortcut' }).click();
  await expect(first('keywords')).toBeFocused();
  await first('keywords').fill('jira');
  await first('name').fill('Jira');
  await first('address').fill('jira.example.com/browse/ARC-{1}');
  await expect(dialog.getByText('jira 1 opens jira.example.com/browse/ARC-1')).toBeVisible();

  // A keyword another shortcut has can't be saved.
  await dialog.getByRole('button', { name: 'Add Shortcut' }).click();
  await first('keywords').fill('yt');
  await first('address').fill('example.com/{1}');
  await expect(dialog.getByText('YouTube uses “yt” already.')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save' })).toBeDisabled();

  // A site search, in its place.
  await first('keywords').fill('kg');
  await first('name').fill('Kagi');
  await first('address').fill('kagi.com/search?q=%s');
  await expect(dialog.getByText('Type kg, then Tab, to search Kagi.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);

  await openBar(page);
  await field(page).pressSequentially('jira 42');
  await expect(selected(page)).toContainText('jira.example.com/browse/ARC-42');
  await field(page).press('Enter');
  await expect.poll(async () => (await todayTitles(page))[0]).toContain('jira.example.com');

  await openBar(page);
  await field(page).pressSequentially('kg');
  await expect(bar(page).locator('[class*="keyHint"]')).toHaveText(/^Search\s*Kagi\s*Tab$/);
  await field(page).press('Tab');
  await expect(bar(page).getByText('Kagi', { exact: true })).toBeVisible();
  await field(page).pressSequentially('arc browser');
  await field(page).press('Enter');
  await expect.poll(async () => (await todayTitles(page))[0]).toContain('kagi.com');
});

test('deleting shortcuts can be undone', async ({ page }) => {
  await page.goto('/');
  await expect(panel(page).locator('[data-active-page] [data-nav-row="tab"]')).toHaveCount(4);
  await panel(page).getByRole('button', { name: 'More', exact: true }).click();
  await panel(page).getByRole('menuitem', { name: 'Site Search & Shortcuts…' }).click();
  const dialog = panel(page).getByRole('dialog', { name: 'Site Search & Shortcuts' });
  // YouTube is third, after Localhost and Google.
  await expect(dialog.getByRole('textbox', { name: 'Shortcut 3: name' })).toHaveValue('YouTube');
  await dialog.getByRole('button', { name: 'Remove shortcut 3' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(panel(page).getByText('Deleted “YouTube”')).toBeVisible();

  await openBar(page);
  await field(page).pressSequentially('yt');
  await expect(bar(page).locator('[class*="keyHint"]')).toHaveCount(0);
  await field(page).press('Escape');

  await panel(page).getByRole('button', { name: 'Undo' }).click();
  await openBar(page);
  await field(page).pressSequentially('yt');
  await expect(bar(page).locator('[class*="keyHint"]')).toHaveText(/^Search\s*YouTube\s*Tab$/);
});
