import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');

// The harness seeds: Pinned = Gmail, Calendar, Dev (Linear, GitHub);
// Today = Engineering Wiki, Figma, chrome.sidePanel docs, YouTube. Gmail is in front.
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
