import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');
const today = (page: Page) => panel(page).locator('[data-active-page] [data-nav-row="tab"]');
const row = (page: Page, text: string) => today(page).filter({ hasText: text });

// ?fixture=edge adds titles and pages that break naive rows.
async function ready(page: Page) {
  await page.goto('/?fixture=edge');
  await expect(today(page)).toHaveCount(15);
}

test('long, right-to-left and missing titles stay readable on one line', async ({ page }) => {
  await ready(page);
  const heights = await today(page).evaluateAll((rows) =>
    rows.map((r) => Math.round(r.getBoundingClientRect().height)),
  );
  expect(new Set(heights).size, 'every row is one line').toBe(1);

  // A page with no title shows its hostname.
  await expect(row(page, 'untitled.example')).toHaveCount(1);

  const title = (text: string) => row(page, text).locator('[dir="auto"]');
  await expect(title('مرحبا بالعالم')).toHaveCSS('direction', 'rtl');
  await expect(title('Engineering Wiki')).toHaveCSS('direction', 'ltr');

  // The full title shows as a tooltip only when it's cut off.
  await title('Pneumono').hover();
  await expect(title('Pneumono')).toHaveAttribute('title', /^Pneumono.*Supercalifragilistic$/);
  await title('Engineering Wiki').hover();
  await expect(title('Engineering Wiki')).toHaveAttribute('title', '');
});

test('pages without a favicon and discarded tabs get a normal row', async ({ page }) => {
  await ready(page);
  for (const text of ['Settings', 'notes.txt']) {
    const icon = row(page, text).locator('svg').first();
    await expect(icon).toHaveCSS('width', '16px');
  }
  const asleep = row(page, 'Asleep');
  await expect(asleep).toHaveCount(1);
  await expect(asleep.locator('[class*="spinner"]')).toHaveCount(0);
});

test('a tab closed from Chrome while its menu is open closes the menu and keeps focus', async ({
  page,
}) => {
  await ready(page);
  const target = row(page, 'Engineering Wiki');
  const id = Number(await target.getAttribute('data-row-id'));
  await target.click({ button: 'right' });
  await expect(panel(page).getByRole('menu')).toBeVisible();

  await page.evaluate((tabId) => window.harnessPlatform.closeTab(tabId), id);
  await expect(panel(page).getByRole('menu')).toHaveCount(0);
  await expect(target).toHaveCount(0);
  // Focus moved to the next row, so the keyboard keeps working.
  await expect(row(page, 'Sidebar explorations')).toBeFocused();
});

test('a part of the panel that fails shows a note and leaves the rest working', async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as { crashRegions?: string[] }).crashRegions = ['favorites', 'space'];
  });
  await page.goto('/?fixture=edge');
  const alerts = panel(page).getByRole('alert');
  await expect(alerts.filter({ hasText: "Favorites couldn't be shown." })).toBeVisible();
  await expect(alerts.filter({ hasText: "This space couldn't be shown." })).toBeVisible();
  await expect(alerts.first().getByRole('button', { name: 'Reload sidebar' })).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'More' })).toBeVisible();
});
