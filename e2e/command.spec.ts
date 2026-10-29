import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');
/** The bar over the page, in its own frame, as the overlay script adds it in Chrome. */
const bar = (page: Page) => page.frameLocator('iframe[title="Command bar"]');
const field = (page: Page) => bar(page).getByRole('combobox');
const selected = (page: Page) => bar(page).locator('[role="option"][aria-selected="true"]');

// The harness seeds one space: Pinned = Gmail (active), Calendar, Dev (Linear, GitHub); Today =
// Engineering Wiki, Figma, chrome.sidePanel docs, YouTube. History has github.com typed often.

async function ready(page: Page) {
  await page.goto('/');
  await expect(panel(page).locator('[data-active-page] [data-nav-row="tab"]')).toHaveCount(4);
}

/** ⌥T over the page, as the shortcut does with the page focused. */
async function openBar(page: Page) {
  await page.getByRole('heading', { name: 'Arc Sidebar harness' }).click();
  await page.keyboard.press('Alt+KeyT');
  await expect(field(page)).toBeFocused();
}

const todayTitles = (page: Page) =>
  panel(page).locator('[data-active-page] [data-nav-row="tab"]').allTextContents();
const selectedRow = (page: Page) =>
  panel(page).locator('[data-active-page] [data-nav-row][data-selected]');

test('the shortcut opens the bar over the page with the field focused; Escape closes it', async ({
  page,
}) => {
  await ready(page);
  await openBar(page);
  // With nothing typed it suggests this space's other tabs.
  await expect(selected(page)).toContainText('Engineering Wiki');
  await expect(selected(page)).toContainText('Switch to Tab');
  await field(page).press('Escape');
  await expect(page.locator('iframe[title="Command bar"]')).toHaveCount(0);

  // A press outside the card closes it too, and ⌥T toggles.
  await openBar(page);
  await page.mouse.click(30, 700);
  await expect(page.locator('iframe[title="Command bar"]')).toHaveCount(0);
  await openBar(page);
  await field(page).press('Alt+KeyT');
  await expect(page.locator('iframe[title="Command bar"]')).toHaveCount(0);
});

test('typing a tab’s name and Return switches to it', async ({ page }) => {
  await ready(page);
  await openBar(page);
  await field(page).pressSequentially('figma');
  await expect(selected(page)).toContainText('Sidebar explorations – Figma');
  await field(page).press('Enter');
  await expect(page.locator('iframe[title="Command bar"]')).toHaveCount(0);
  await expect(selectedRow(page)).toContainText('Figma');
});

test('an address opens in a new tab at the top of Today', async ({ page }) => {
  await ready(page);
  await openBar(page);
  await field(page).pressSequentially('arc.net/max');
  await expect(selected(page)).toContainText('arc.net/max');
  await expect(selected(page)).toContainText('Open');
  await field(page).press('Enter');
  await expect.poll(async () => (await todayTitles(page))[0]).toBe('arc.net');
  await expect(selectedRow(page)).toContainText('arc.net');
});

test('addresses typed before complete inline; Backspace drops the completion', async ({ page }) => {
  await ready(page);
  await openBar(page);
  await field(page).pressSequentially('gi');
  await expect(field(page)).toHaveValue('github.com');
  // The completed part is selected, so the next letter replaces it.
  expect(
    await field(page).evaluate((input: HTMLInputElement) => [
      input.selectionStart,
      input.selectionEnd,
    ]),
  ).toEqual([2, 10]);
  await field(page).press('Backspace');
  await expect(field(page)).toHaveValue('gi');
  await field(page).press('t');
  await expect(field(page)).toHaveValue('github.com');
  await field(page).press('Enter');
  await expect.poll(async () => (await todayTitles(page))[0]).toBe('github.com');
});

test('words search the web in a new tab', async ({ page }) => {
  await ready(page);
  await openBar(page);
  await field(page).pressSequentially('arc browser shortcuts');
  await expect(selected(page)).toContainText('Search');
  await field(page).press('Enter');
  await expect
    .poll(async () => (await todayTitles(page))[0])
    .toBe('arc browser shortcuts - Google Search');
});

test('Tab searches actions, which run in the sidebar with its Undo', async ({ page }) => {
  await ready(page);
  await openBar(page);
  await field(page).press('Tab');
  await expect(bar(page).getByText('Actions', { exact: true })).toBeVisible();
  await field(page).pressSequentially('unpin');
  await expect(selected(page)).toHaveText('Unpin Tab');
  await field(page).press('Enter');
  await expect(panel(page).getByRole('status')).toContainText('Unpinned “Inbox (3) - Gmail”');
  await expect(panel(page).getByRole('button', { name: 'Undo' })).toBeVisible();
  await expect.poll(async () => (await todayTitles(page))[0]).toBe('Inbox (3) - Gmail');
});

test('actions that need a name ask for it in the bar', async ({ page }) => {
  await ready(page);
  await openBar(page);
  await field(page).pressSequentially('/new space');
  await field(page).press('Enter');
  await expect(bar(page).getByText('Name the space')).toBeVisible();
  await expect(field(page)).toHaveValue('Space 2');
  await field(page).pressSequentially('Reading');
  await field(page).press('Enter');
  await expect(panel(page).locator('[data-active-page]')).toHaveAttribute('aria-label', 'Reading');

  // Typing a space's name switches back to it.
  await openBar(page);
  await field(page).pressSequentially('space');
  await expect(selected(page)).toContainText('Switch to Space');
  await field(page).press('Enter');
  await expect(panel(page).locator('[data-active-page]')).toHaveAttribute('aria-label', 'Space');
});

test('New Tab opens the bar inside the sidebar, and Escape gives focus back', async ({ page }) => {
  await ready(page);
  const newTab = panel(page).getByRole('button', { name: 'New Tab' });
  await newTab.focus();
  await newTab.press('Enter');
  const inSidebar = panel(page).getByRole('combobox');
  await expect(inSidebar).toBeFocused();
  await inSidebar.pressSequentially('wiki');
  await expect(panel(page).locator('#command-results [aria-selected="true"]')).toContainText(
    'Engineering Wiki',
  );
  await inSidebar.press('Escape');
  await expect(inSidebar).toHaveCount(0);
  await expect(newTab).toBeFocused();
});

test('Copy URL as Markdown puts the current tab’s link on the clipboard', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ready(page);
  await openBar(page);
  await field(page).pressSequentially('/markdown');
  await expect(selected(page)).toHaveText('Copy URL as Markdown');
  await field(page).press('Enter');
  await expect(panel(page).getByRole('status')).toContainText('Copied URL as Markdown');
  // Only a focused page may read the clipboard.
  await page.getByRole('heading', { name: 'Arc Sidebar harness' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    '[Inbox (3) - Gmail](https://mail.google.com/mail/u/0/#inbox)',
  );
});
