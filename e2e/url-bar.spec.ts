import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');
const today = (page: Page) => panel(page).locator('[data-active-page] [data-nav-row="tab"]');
const address = (page: Page) => panel(page).getByRole('button', { name: /Edit address/ });

// The harness selects Gmail (https://mail.google.com/mail/u/0/#inbox) at first.

async function ready(page: Page) {
  await page.goto('/');
  await expect(today(page)).toHaveCount(4);
}

async function siteMenu(page: Page) {
  await address(page).hover();
  await panel(page).getByRole('button', { name: 'Site controls' }).click();
  return panel(page).getByRole('dialog', { name: 'Site controls' });
}

test('shows the selected tab’s site, and follows the selection', async ({ page }) => {
  await ready(page);
  await expect(address(page)).toHaveText('mail.google.com');
  await today(page).filter({ hasText: 'Figma' }).click();
  await expect(address(page)).toHaveText('figma.com');
});

test('clicking it edits the address; Return loads it in the same tab', async ({ page }) => {
  await ready(page);
  await today(page).filter({ hasText: 'Engineering Wiki' }).click();
  await address(page).click();
  const field = panel(page).getByRole('combobox');
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('https://www.notion.so/');
  // The address starts selected, so typing replaces it.
  expect(
    await field.evaluate((input: HTMLInputElement) => [input.selectionStart, input.selectionEnd]),
  ).toEqual([0, 'https://www.notion.so/'.length]);
  await field.pressSequentially('arc.net');
  await field.press('Enter');
  await expect(address(page)).toHaveText('arc.net');
  await expect(today(page)).toHaveCount(4);
  await expect(today(page).filter({ hasText: 'Engineering Wiki' })).toHaveCount(0);
});

test('the copy button copies the address', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ready(page);
  await address(page).hover();
  await panel(page).getByRole('button', { name: 'Copy URL' }).click();
  await expect(panel(page).getByRole('status')).toContainText('Copied URL');
  await page.getByRole('heading', { name: 'Arc Sidebar harness' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'https://mail.google.com/mail/u/0/#inbox',
  );
});

test('the site menu turns on Developer Mode for the site', async ({ page }) => {
  await ready(page);
  const menu = await siteMenu(page);
  await menu.getByRole('button', { name: /Developer Mode/ }).click();
  await expect(menu.getByRole('button', { name: /Developer Mode/ })).toContainText('On');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  // The whole address in the bar, and the site under the tab's title.
  await expect(address(page)).toHaveText('mail.google.com/mail/u/0/#inbox');
  await expect(
    panel(page).locator('[data-nav-row="pin"]', { hasText: 'Inbox (3) - Gmail' }),
  ).toContainText('mail.google.com');
});

test('the site menu lists and changes the site’s permissions', async ({ page }) => {
  await ready(page);
  let menu = await siteMenu(page);
  const notifications = menu.getByRole('button', { name: /Notifications/ });
  await expect(notifications).toContainText('Allowed');
  await notifications.click();
  await expect(notifications).toContainText('Blocked');
  await page.keyboard.press('Escape');
  menu = await siteMenu(page);
  await expect(menu.getByRole('button', { name: /Notifications/ })).toContainText('Blocked');
  await expect(menu.getByRole('button', { name: 'Secure' })).toBeVisible();
});

test('Capture copies a picture of the page and offers to save it', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ready(page);
  const menu = await siteMenu(page);
  await menu.getByRole('button', { name: 'Capture Full Page' }).click();
  await expect(menu).toBeHidden();
  const toast = panel(page).getByRole('status');
  await expect(toast).toContainText('Copied full-page screenshot');
  await expect(toast.getByRole('button', { name: 'Save' })).toBeVisible();
  await page.getByRole('heading', { name: 'Arc Sidebar harness' }).click();
  const types = await page.evaluate(async () =>
    (await navigator.clipboard.read()).flatMap((item) => item.types),
  );
  expect(types).toContain('image/png');
});

/** The capture tool's layer: in a closed shadow root, so found by its host. */
const captureTool = (page: Page) => page.locator('[data-arc-sidebar="capture"]');

/** The size of the picture on the clipboard. */
async function clipboardPicture(page: Page) {
  return page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    const bitmap = await createImageBitmap(await item!.getType('image/png'));
    return [bitmap.width, bitmap.height];
  });
}

test('Capture outlines the element under the pointer; a click copies just that', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ready(page);
  const menu = await siteMenu(page);
  await menu.getByRole('button', { name: 'Capture', exact: true }).click();
  await expect(captureTool(page)).toHaveCount(1);
  // The harness page stands in for the tab's page.
  const target = page.getByRole('button', { name: 'Open a pull request' });
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(100);
  await page.mouse.down();
  await page.mouse.up();
  await expect(captureTool(page)).toHaveCount(0);
  await expect
    .poll(() => clipboardPicture(page).catch(() => null))
    .toEqual([Math.round(box.width), Math.round(box.height)]);
});

test('Capture copies an area dragged out; Escape leaves', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await ready(page);
  let menu = await siteMenu(page);
  await menu.getByRole('button', { name: 'Capture', exact: true }).click();
  await page.mouse.move(100, 100);
  await page.mouse.down();
  await page.mouse.move(260, 180, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => clipboardPicture(page).catch(() => null)).toEqual([160, 80]);

  menu = await siteMenu(page);
  await menu.getByRole('button', { name: 'Capture', exact: true }).click();
  await expect(captureTool(page)).toHaveCount(1);
  await page.mouse.click(400, 300, { button: 'right' });
  await expect(captureTool(page)).toHaveCount(0);
});
