import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');

// The harness seeds one space: Pinned = Gmail (active), Calendar, Dev (Linear,
// GitHub); Today = Engineering Wiki, Figma, chrome.sidePanel docs, YouTube.

async function titles(page: Page, kind: 'tab' | 'pin') {
  return panel(page)
    .locator(`[data-sidebar] [data-nav-row="${kind}"]`)
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

async function newSpace(page: Page, name: string) {
  await panel(page).getByRole('button', { name: 'More', exact: true }).click();
  await panel(page).getByRole('menuitem', { name: 'New Space' }).click();
  const field = panel(page).getByRole('textbox', { name: 'Name' });
  await field.fill(name);
  await field.press('Enter');
}

test('a new space starts empty with a new tab, and switching back restores the first', async ({
  page,
}) => {
  await ready(page);
  await newSpace(page, 'Work');
  await expect(panel(page).getByText('Work', { exact: true })).toBeVisible();
  await expect.poll(() => titles(page, 'pin')).toEqual([]);
  await expect.poll(() => titles(page, 'tab')).toEqual(['New Tab']);

  await panel(page).getByRole('button', { name: 'Space', exact: true }).click();
  await expect.poll(() => titles(page, 'tab')).toHaveLength(4);
  await expect.poll(() => titles(page, 'pin')).toHaveLength(4);
  // The tab last used there (Gmail) is selected again.
  await expect(panel(page).locator('[data-nav-row="pin"][data-selected]')).toContainText('Gmail');
});

test('moves a Today tab to another space from its menu', async ({ page }) => {
  await ready(page);
  await newSpace(page, 'Work');
  await panel(page).getByRole('button', { name: 'Space', exact: true }).click();
  await expect.poll(() => titles(page, 'tab')).toHaveLength(4);

  await panel(page)
    .locator('[data-nav-row="tab"]', { hasText: 'Engineering Wiki' })
    .click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Move to Space' }).hover();
  await panel(page).getByRole('menuitem', { name: 'Work' }).click();
  await expect.poll(() => titles(page, 'tab')).not.toContain('Engineering Wiki');

  await panel(page).getByRole('button', { name: 'Work', exact: true }).click();
  await expect.poll(() => titles(page, 'tab')).toContain('Engineering Wiki');
});

test('⌃1 and ⌃2 switch spaces when the panel has focus', async ({ page }) => {
  await ready(page);
  await newSpace(page, 'Work');
  await expect.poll(() => titles(page, 'pin')).toEqual([]);
  await panel(page).locator('[data-nav-row="tab"]').first().focus();
  await page.keyboard.press('Control+1');
  await expect.poll(() => titles(page, 'pin')).toHaveLength(4);
  await panel(page).locator('[data-nav-row="pin"]').first().focus();
  await page.keyboard.press('Control+2');
  await expect.poll(() => titles(page, 'pin')).toEqual([]);
});

test('deleting a space can be undone', async ({ page }) => {
  await ready(page);
  await panel(page).locator('[data-sidebar] [class*="header"]').first().click({ button: 'right' });
  await expect(panel(page).getByRole('menuitem', { name: 'Delete Space' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await newSpace(page, 'Work');
  await panel(page).getByText('Work', { exact: true }).click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Delete Space' }).click();
  await expect(panel(page).getByRole('navigation', { name: 'Spaces' })).toHaveCount(0);
  await panel(page).getByRole('button', { name: 'Undo' }).click();
  await expect(panel(page).getByRole('button', { name: 'Work', exact: true })).toBeVisible();
});
