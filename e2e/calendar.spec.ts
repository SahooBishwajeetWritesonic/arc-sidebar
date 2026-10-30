import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');
const today = (page: Page) => panel(page).locator('[data-active-page] [data-nav-row="tab"]');
const calendar = (page: Page) =>
  panel(page).locator('[data-active-page] [data-nav-row="pin"]', { hasText: 'Google Calendar' });
const live = (page: Page) => panel(page).getByRole('group', { name: 'Next meeting' });

// The harness's feed: Design review in 3 min (Meet), a daily Standup in 2 h (Zoom), Sprint
// planning in 20 h, a declined Team lunch and an all-day Offsite.
const FEED = 'https://calendar.google.com/calendar/ical/me%40example.com/private-abc/basic.ics';

async function setUp(page: Page, feed: string) {
  await calendar(page).click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Live Calendar…' }).click();
  await panel(page).getByRole('textbox', { name: 'Secret address in iCal format' }).fill(feed);
  await panel(page)
    .getByRole('button', { name: /^(Turn On|Save)$/ })
    .click();
}

async function turnOn(page: Page) {
  await page.goto('/');
  await expect(today(page)).toHaveCount(4);
  await expect(live(page)).toHaveCount(0);
  await setUp(page, FEED);
}

test('Live Calendar counts down to the next meeting, and Join opens its call', async ({ page }) => {
  await turnOn(page);
  await expect(live(page)).toContainText('Design review');
  await expect(live(page)).toContainText(/in [23] min/);
  await live(page).getByRole('button', { name: 'Join' }).click();
  await expect(today(page).filter({ hasText: 'meet.google.com' })).toHaveCount(1);
});

test('an address with no calendar says so; Turn Off takes the meeting away', async ({ page }) => {
  await turnOn(page);
  await expect(live(page)).toBeVisible();
  await setUp(page, 'https://calendar.google.com/missing.ics');
  await calendar(page).click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Live Calendar…' }).click();
  await expect(panel(page).getByText('No calendar at this address.')).toBeVisible();
  await panel(page).getByRole('button', { name: 'Turn Off' }).click();
  await expect(live(page)).toHaveCount(0);
});
