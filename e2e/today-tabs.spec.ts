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

test('Archive Tabs Below archives what’s under the tab except audio, with Undo', async ({
  page,
}) => {
  await ready(page);
  await today(page).first().click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Archive Tabs Below' }).click();
  await expect.poll(() => titles(page)).toEqual(['Engineering ', 'Lo-fi beats ']);
  await expect(panel(page).getByRole('status')).toContainText('Archived 2 tabs');

  // Nothing left below the last tab: no such item.
  await today(page).last().click({ button: 'right' });
  await expect(panel(page).getByRole('menuitem', { name: 'Close Tab' })).toBeVisible();
  await expect(panel(page).getByRole('menuitem', { name: 'Archive Tabs Below' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await panel(page).getByRole('status').getByRole('button', { name: 'Undo' }).click();
  await expect(today(page)).toHaveCount(4);
});

test('Option-click splits a tab with the current one; on the split, separates it', async ({
  page,
}) => {
  await ready(page);
  await today(page).filter({ hasText: 'Engineering Wiki' }).click();
  await today(page)
    .filter({ hasText: 'chrome.sidePanel' })
    .click({ modifiers: ['Alt'] });
  const split = panel(page).locator('[data-active-page] [data-nav-row="split"]');
  await expect(split).toHaveCount(1);
  await expect(split.locator('[data-pane]').first()).toContainText('Engineering Wiki');
  await expect(split.locator('[data-pane]').last()).toContainText('chrome.sidePanel');
  await expect(split.locator('[data-pane]').last()).toHaveAttribute('data-active', 'true');

  await split.click({ modifiers: ['Alt'] });
  await expect(split).toHaveCount(0);
  await expect(today(page)).toHaveCount(4);
});

test('⌘-clicking a pinned tab’s icon resets it and keeps the page in a new tab', async ({
  page,
}) => {
  await ready(page);
  await page.getByRole('button', { name: 'Follow a link in the active tab' }).click();
  const gmail = pins(page).first();
  await expect(gmail).toContainText('Another page');
  await gmail.locator('[data-resettable]').click({ modifiers: ['Meta'] });
  await expect(gmail).not.toContainText('Another page');
  await expect(today(page).first()).toContainText('Another page');
  await expect(today(page).first()).toHaveAttribute('data-selected', 'true');
});

test('a link or text dropped onto the sidebar opens as a new tab, or a search', async ({
  page,
}) => {
  await ready(page);
  const frame = page.frames().find((f) => f.url().includes('panel'))!;
  const drop = async (type: string, value: string) => {
    const data = await frame.evaluateHandle(
      ([type, value]) => {
        const transfer = new DataTransfer();
        transfer.setData(type!, value!);
        return transfer;
      },
      [type, value],
    );
    const sidebar = panel(page).locator('[data-sidebar]');
    await sidebar.dispatchEvent('dragover', { dataTransfer: data });
    await sidebar.dispatchEvent('drop', { dataTransfer: data });
  };

  await drop('text/uri-list', 'https://example.com/dropped');
  await expect(today(page)).toHaveCount(5);
  await expect(today(page).first()).toContainText('example.com');
  await drop('text/plain', 'side panel docs');
  await expect(today(page)).toHaveCount(6);
  await expect(today(page).first()).toContainText('side panel docs');
});

test('Move to New Window takes the tab out of this window’s Today', async ({ page }) => {
  await ready(page);
  await today(page).filter({ hasText: 'Sidebar explorations' }).click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Move to New Window' }).click();
  await expect(today(page)).toHaveCount(3);
  await expect(today(page).filter({ hasText: 'Sidebar explorations' })).toHaveCount(0);
});
