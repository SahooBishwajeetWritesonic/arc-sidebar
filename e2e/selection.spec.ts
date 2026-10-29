import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');

// The harness seeds: Pinned = Gmail, Calendar, Dev (Linear, GitHub);
// Today = Engineering Wiki, Figma, chrome.sidePanel docs, YouTube. Gmail is in front.

/** The sidebar's rows, top to bottom, as "kind:depth:title". */
async function rows(page: Page) {
  return panel(page)
    .locator('[data-active-page] [data-nav-row]')
    .evaluateAll((elements) =>
      elements.map((el) => {
        const element = el as HTMLElement;
        const title = element.querySelector('span[class*="title"]')?.textContent ?? '';
        return `${element.dataset.navRow}:${element.dataset.depth ?? 0}:${title.slice(0, 18)}`;
      }),
    );
}

/** The titles of the rows selected together. */
const selected = (page: Page) =>
  panel(page)
    .locator('[data-active-page] [data-multi-selected]')
    .evaluateAll((elements) =>
      elements.map((el) => el.querySelector('span[class*="title"]')?.textContent?.slice(0, 18)),
    );

async function ready(page: Page) {
  await page.goto('/');
  await expect(panel(page).locator('[data-active-page] [data-nav-row="tab"]')).toHaveCount(4);
}

const row = (page: Page, title: string) =>
  panel(page).locator('[data-active-page] [data-nav-row]', { hasText: title }).first();

const add = (page: Page, title: string) => row(page, title).click({ modifiers: ['Meta'] });

test('⌘-click selects a row with the tab in front, ⇧-click a range; Escape lets go', async ({
  page,
}) => {
  await ready(page);
  await add(page, 'Sidebar explorations');
  await expect.poll(() => selected(page)).toEqual(['Inbox (3) - Gmail', 'Sidebar exploratio']);
  // The page in front stays where it was.
  await expect(row(page, 'Inbox (3) - Gmail')).toHaveAttribute('data-selected');

  await row(page, 'Lo-fi beats').click({ modifiers: ['Shift'] });
  await expect
    .poll(() => selected(page))
    .toEqual(['Sidebar exploratio', 'chrome.sidePanel |', 'Lo-fi beats to cod']);
  await add(page, 'chrome.sidePanel');
  await expect.poll(() => selected(page)).toEqual(['Sidebar exploratio', 'Lo-fi beats to cod']);

  await page.keyboard.press('Escape');
  await expect.poll(() => selected(page)).toEqual([]);
});

test('a plain click on a row outside the selection selects just it', async ({ page }) => {
  await ready(page);
  await add(page, 'Sidebar explorations');
  await add(page, 'Engineering Wiki');
  await expect.poll(() => selected(page)).toHaveLength(3);
  await row(page, 'Lo-fi beats').click();
  await expect.poll(() => selected(page)).toEqual([]);
  await expect(row(page, 'Lo-fi beats')).toHaveAttribute('data-selected');
});

test('Copy URLs copies every selected row, top to bottom', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ready(page);
  await add(page, 'Sidebar explorations');
  await add(page, 'Google Calendar');
  await row(page, 'Sidebar explorations').click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Copy URLs' }).click();
  await expect(panel(page).getByRole('status')).toContainText('Copied 3 URLs');
  await page.getByRole('heading', { name: 'Arc Sidebar harness' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    [
      'https://mail.google.com/mail/u/0/#inbox',
      'https://calendar.google.com/',
      'https://www.figma.com/',
    ].join('\n'),
  );
});

test('a right-click outside the selection gets that row’s own menu', async ({ page }) => {
  await ready(page);
  await add(page, 'Sidebar explorations');
  await row(page, 'Lo-fi beats').click({ button: 'right' });
  await expect(panel(page).getByRole('menuitem', { name: 'Pin Tab' })).toBeVisible();
  await expect(panel(page).getByRole('menuitem', { name: 'Copy URLs' })).toHaveCount(0);
  await expect.poll(() => selected(page)).toEqual([]);
});

test('New Folder puts the selection in a folder where the first pinned tab was', async ({
  page,
}) => {
  await ready(page);
  await row(page, 'Engineering Wiki').click();
  await add(page, 'Sidebar explorations');
  await add(page, 'Google Calendar');
  await row(page, 'Engineering Wiki').click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'New Folder' }).click();
  await expect(panel(page).getByRole('textbox')).toBeFocused();
  await page.keyboard.type('Reading');
  await page.keyboard.press('Enter');
  await expect
    .poll(() => rows(page))
    .toEqual([
      'pin:0:Inbox (3) - Gmail',
      'folder:0:Reading',
      'pin:1:Google Calendar - ',
      'pin:1:Engineering Wiki',
      'pin:1:Sidebar exploratio',
      'folder:0:Dev',
      'pin:1:My issues · Linear',
      'pin:1:Pull requests · Gi',
      'newtab:0:New Tab',
      'tab:0:chrome.sidePanel |',
      'tab:0:Lo-fi beats to cod',
    ]);
  await expect.poll(() => selected(page)).toEqual([]);
});

test('Delete closes every selected tab; pinned ones keep their pins', async ({ page }) => {
  await ready(page);
  await row(page, 'Sidebar explorations').click();
  await add(page, 'chrome.sidePanel');
  await add(page, 'Google Calendar');
  await page.keyboard.press('Delete');
  await expect
    .poll(() => rows(page))
    .toEqual([
      'pin:0:Inbox (3) - Gmail',
      'pin:0:Google Calendar - ',
      'folder:0:Dev',
      'pin:1:My issues · Linear',
      'pin:1:Pull requests · Gi',
      'newtab:0:New Tab',
      'tab:0:Engineering Wiki',
      'tab:0:Lo-fi beats to cod',
    ]);
  await expect(row(page, 'Google Calendar').getByRole('button', { name: 'Close tab' })).toHaveCount(
    0,
  );
});
