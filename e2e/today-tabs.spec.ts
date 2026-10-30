import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');
const today = (page: Page) => panel(page).locator('[data-active-page] [data-nav-row="tab"]');
const pins = (page: Page) => panel(page).locator('[data-active-page] [data-nav-row="pin"]');

// The harness seeds: Pinned = Gmail, Calendar, Dev (Linear, GitHub);
// Today = Engineering Wiki, Figma, chrome.sidePanel docs, YouTube.

async function ready(page: Page) {
  await page.goto('/');
  await expect(today(page)).toHaveCount(4);
}

async function rename(page: Page, from: string, to: string) {
  await today(page).filter({ hasText: from }).dblclick();
  const field = panel(page).getByRole('textbox', { name: 'Name' });
  await expect(field).toBeFocused();
  await field.fill(to);
  await page.keyboard.press('Enter');
}

test('double-clicking a Today tab renames it; clearing the name gives back its title', async ({
  page,
}) => {
  await ready(page);
  await rename(page, 'Engineering Wiki', 'Wiki');
  await expect(today(page).first()).toHaveText('Wiki');

  await today(page).first().click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Rename…' }).click();
  await expect(panel(page).getByRole('textbox', { name: 'Name' })).toHaveValue('Wiki');
  await panel(page).getByRole('textbox', { name: 'Name' }).fill('');
  await page.keyboard.press('Enter');
  await expect(today(page).first()).toContainText('Engineering Wiki');
});

test('a renamed tab keeps its name when pinned and unpinned, and in the archive', async ({
  page,
}) => {
  await ready(page);
  await rename(page, 'Engineering Wiki', 'Wiki');
  await today(page).filter({ hasText: 'Wiki' }).click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Pin Tab' }).click();
  await expect(pins(page).filter({ hasText: /^Wiki$/ })).toHaveCount(1);

  await pins(page)
    .filter({ hasText: /^Wiki$/ })
    .click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Unpin' }).click();
  await expect(today(page).first()).toHaveText('Wiki');

  await today(page).first().getByRole('button', { name: 'Close tab' }).click();
  await panel(page).getByRole('button', { name: 'Archive', exact: true }).click();
  await expect(panel(page).locator('[data-archive-entry]', { hasText: 'Wiki' })).toHaveCount(1);
});

const titles = (page: Page) =>
  today(page).evaluateAll((rows) => rows.map((row) => row.textContent?.slice(0, 12) ?? ''));

test('Duplicate opens a copy just below the tab, and a link from a tab opens below it', async ({
  page,
}) => {
  await ready(page);
  await today(page).filter({ hasText: 'Sidebar explorations' }).click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(today(page)).toHaveCount(5);
  await expect
    .poll(() => titles(page))
    .toEqual(['Engineering ', 'Sidebar expl', 'Sidebar expl', 'chrome.sideP', 'Lo-fi beats ']);
  await expect(today(page).nth(2)).toHaveAttribute('data-selected', 'true');

  // From the copy, two links in new tabs: below it, in the order they were opened.
  const link = page.getByRole('button', { name: 'Open a link from the active tab in a new tab' });
  await link.click();
  await link.click();
  await expect
    .poll(() => titles(page))
    .toEqual([
      'Engineering ',
      'Sidebar expl',
      'Sidebar expl',
      'A link on ww',
      'A link on ww',
      'chrome.sideP',
      'Lo-fi beats ',
    ]);
});
