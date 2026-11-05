import { inflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { FRAME_SCHEME } from '../src/platform/command-bar';

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

test('history is found by letters in order, not only as typed', async ({ page }) => {
  await ready(page);
  await openBar(page);
  await field(page).pressSequentially('hckr nws');
  const row = bar(page).getByRole('option').filter({ hasText: 'Hacker News' });
  await expect(row).toBeVisible();
  // Below the search, as a guess.
  await expect(selected(page)).toContainText('hckr nws');
  await row.click();
  await expect.poll(async () => (await todayTitles(page))[0]).toContain('news.ycombinator.com');
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
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe('[Inbox (3) - Gmail](https://mail.google.com/mail/u/0/#inbox)');
});

test('Reset Space sends every pinned tab back to its pinned page', async ({ page }) => {
  await ready(page);
  await page.getByRole('button', { name: 'Follow a link in the active tab' }).click();
  const gmail = panel(page).locator('[data-active-page] [data-nav-row="pin"]').first();
  await expect(gmail).toContainText('Another page');
  await openBar(page);
  await field(page).pressSequentially('/reset space');
  await expect(selected(page)).toHaveText('Reset Space');
  await field(page).press('Enter');
  await expect(gmail).not.toContainText('Another page');
});

test('Reveal Tab in Sidebar scrolls to the selected tab and focuses it', async ({ page }) => {
  await ready(page);
  await openBar(page);
  await field(page).pressSequentially('/reveal');
  await expect(selected(page)).toHaveText('Reveal Tab in Sidebar');
  await field(page).press('Enter');
  await expect(selectedRow(page)).toBeFocused();
});

test('a site’s keyword and Tab search that site', async ({ page }) => {
  await ready(page);
  await openBar(page);
  await field(page).pressSequentially('yt');
  await expect(bar(page).locator('[class*="keyHint"]')).toHaveText(/^Search\s*YouTube\s*Tab$/);
  await field(page).press('Tab');
  const badge = bar(page).getByText('YouTube', { exact: true });
  await expect(badge).toBeVisible();
  await expect(badge).toHaveCSS('background-color', 'rgb(255, 0, 51)');
  await expect(bar(page).locator('[class*="keyHint"]')).toHaveCount(0);
  await expect(field(page)).toHaveValue('');
  await field(page).pressSequentially('lofi beats');
  await expect(selected(page)).toContainText('lofi beats');
  await field(page).press('Enter');
  await expect.poll(async () => (await todayTitles(page))[0]).toContain('youtube.com');
});

test('a link’s keyword and a port open that local server', async ({ page }) => {
  await ready(page);
  await openBar(page);
  await field(page).pressSequentially('lh 3300');
  await expect(selected(page)).toContainText('localhost:3300');
  await expect(selected(page)).toContainText('Localhost');
  await field(page).press('Enter');
  await expect.poll(async () => (await todayTitles(page))[0]).toContain('localhost');
});

test('a link’s keyword lists the pages it opened before, and completes to them', async ({
  page,
}) => {
  await ready(page);
  await openBar(page);
  await field(page).pressSequentially('lh');
  const rows = bar(page).getByRole('option');
  await expect(rows.nth(0)).toContainText('localhost:3000');
  await expect(rows.nth(1)).toContainText('localhost:3300');
  await expect(rows.nth(1)).toContainText('Acme dashboard');
  await expect(rows.nth(2)).toContainText('localhost:5173');
  await field(page).pressSequentially(' 51');
  await expect(field(page)).toHaveValue('lh 5173');
  await expect(selected(page)).toContainText('localhost:5173');
  await field(page).press('Enter');
  await expect.poll(async () => (await todayTitles(page))[0]).toContain('localhost');
});

test('a port alone opens that local server', async ({ page }) => {
  await ready(page);
  await openBar(page);
  await field(page).pressSequentially(':6006');
  await expect(selected(page)).toContainText('localhost:6006');
  await field(page).press('Enter');
  await expect.poll(async () => (await todayTitles(page))[0]).toContain('localhost');
});

test('Backspace in an empty site search goes back to searching everything', async ({ page }) => {
  await ready(page);
  await openBar(page);
  await field(page).pressSequentially('gh');
  await field(page).press('Tab');
  await expect(bar(page).getByText('GitHub', { exact: true })).toBeVisible();
  await field(page).press('Backspace');
  await expect(bar(page).getByText('GitHub', { exact: true })).toHaveCount(0);
  await expect(field(page)).toHaveAttribute('placeholder', 'Search or Enter URL…');
});

test('the bar wears the space’s theme, as the sidebar does', async ({ page }) => {
  await page.goto('/?theme=dark');
  await expect(panel(page).locator('[data-active-page] [data-nav-row="tab"]')).toHaveCount(4);
  await panel(page).locator('[data-active-page] [data-space-header]').click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Edit Theme…' }).click();
  await panel(page).getByRole('button', { name: 'Next colours' }).click();
  await panel(page).getByRole('button', { name: 'Pastel #fdfbfa' }).click();
  await panel(page).getByRole('slider', { name: 'Intensity' }).focus();
  await page.keyboard.press('End');
  await page.keyboard.press('Escape');
  await expect(panel(page).getByRole('dialog')).toHaveCount(0);

  const sidebar = await panel(page)
    .locator('[aria-hidden] > div')
    .evaluateAll((layers) => {
      const shown = layers.find((layer) => Number(getComputedStyle(layer).opacity) > 0.99)!;
      const style = getComputedStyle(shown);
      return [style.backgroundColor, style.backgroundImage];
    });
  await openBar(page);
  const card = bar(page).locator('[class*="card"]').first();
  const look = await card.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      background: [style.backgroundColor, style.backgroundImage],
      scheme: style.colorScheme,
    };
  });
  expect(look.background).toEqual(sidebar);
  // A bright theme turns the sidebar to dark text; the bar follows.
  expect(look.scheme).toBe('light');
});

/** The colour of a 1×1 screenshot. */
function pixel(png: Buffer): [number, number, number] {
  const data: Buffer[] = [];
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    if (png.toString('ascii', at + 4, at + 8) === 'IDAT')
      data.push(png.subarray(at + 8, at + 8 + length));
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  return [raw[1]!, raw[2]!, raw[3]!];
}

test('the bar’s frame stays see-through over a page that offers light and dark, in dark mode', async ({
  page,
  baseURL,
}) => {
  // Google's results page in dark mode: Chrome paints a frame opaque if its scheme differs.
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.setContent(
    `<!doctype html><meta name="color-scheme" content="light dark">` +
      `<style>body{margin:0;background:rgb(255,0,0)}</style>` +
      `<iframe src="${baseURL}/command.html" style="border:0;width:400px;height:300px;` +
      `background:transparent;color-scheme:${FRAME_SCHEME}"></iframe>`,
  );
  await page.frameLocator('iframe').locator('html').waitFor({ state: 'attached' });
  await page.waitForTimeout(500);
  const [red, green] = pixel(
    await page.screenshot({ clip: { x: 380, y: 280, width: 1, height: 1 } }),
  );
  expect(red).toBeGreaterThan(200);
  expect(green).toBeLessThan(60);
});
