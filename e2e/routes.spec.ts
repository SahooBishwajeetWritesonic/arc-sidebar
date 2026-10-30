import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');
const bar = (page: Page) => page.frameLocator('iframe[title="Command bar"]');
const today = (page: Page) => panel(page).locator('[data-active-page] [data-nav-row="tab"]');
const shown = (page: Page) => panel(page).locator('[data-active-page]');

async function newSpace(page: Page, name: string) {
  await panel(page).getByRole('button', { name: 'More', exact: true }).click();
  await panel(page).getByRole('menuitem', { name: 'New Space' }).click();
  const field = panel(page).getByRole('textbox', { name: 'Name' });
  await field.fill(name);
  await field.press('Enter');
}

test('Air Traffic Control opens new tabs at matching addresses in the chosen space', async ({
  page,
}) => {
  await page.goto('/');
  await expect(today(page)).toHaveCount(4);
  await newSpace(page, 'Design');
  await panel(page).getByRole('button', { name: 'Space', exact: true }).click();
  await expect(shown(page)).toHaveAttribute('aria-label', 'Space');

  await panel(page).getByRole('button', { name: 'More', exact: true }).click();
  await panel(page).getByRole('menuitem', { name: 'Air Traffic Control…' }).click();
  const dialog = panel(page).getByRole('dialog', { name: 'Air Traffic Control' });
  await dialog.getByRole('button', { name: 'Add Rule' }).click();
  await dialog.getByRole('textbox', { name: 'Rule 1: address' }).fill('example.org');
  await dialog.getByRole('combobox', { name: 'Open in' }).selectOption({ label: 'Design' });
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);

  // A new tab there, from the command bar: it opens in Design, and the sidebar goes with it.
  await page.getByRole('heading', { name: 'Arc Sidebar harness' }).click();
  await page.keyboard.press('Alt+KeyT');
  await bar(page).getByRole('combobox').pressSequentially('example.org/board');
  await bar(page).getByRole('combobox').press('Enter');
  await expect(shown(page)).toHaveAttribute('aria-label', 'Design');
  await expect(today(page).filter({ hasText: 'example.org' })).toHaveCount(1);
});
