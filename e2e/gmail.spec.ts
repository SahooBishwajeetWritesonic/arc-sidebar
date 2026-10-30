import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');
const gmail = (page: Page) =>
  panel(page).locator('[data-active-page] [data-nav-row="pin"]', { hasText: 'Gmail' });

// The harness's Gmail feed has three unread messages, the pin's "(3)".

async function hoverGmail(page: Page) {
  await page.goto('/');
  await expect(gmail(page)).toHaveCount(1);
  await gmail(page).locator('span[class*="title"]').hover();
}

const activeUrl = (page: Page) =>
  page.evaluate(
    () =>
      (window.harnessPlatform as unknown as { tabs: { active: boolean; url: string }[] }).tabs.find(
        (tab) => tab.active,
      )?.url,
  );

test('hovering a pinned Gmail tab previews its unread mail; a message opens in it', async ({
  page,
}) => {
  await hoverGmail(page);
  const mail = panel(page).getByRole('list', { name: 'Unread mail' });
  await expect(mail.getByRole('button')).toHaveCount(3);
  await expect(panel(page).getByText('3 unread')).toBeVisible();
  await mail.getByRole('button', { name: /Design review moved to 3 pm/ }).click();
  await expect(mail).toHaveCount(0);
  await expect.poll(() => activeUrl(page)).toContain('#inbox/Design%20review');
});

test('Compose in the Gmail preview starts a message', async ({ page }) => {
  await hoverGmail(page);
  await panel(page).getByRole('button', { name: 'Compose' }).click();
  await expect.poll(() => activeUrl(page)).toContain('compose=new');
});

test('the Gmail preview says so when Gmail won’t answer', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => void (window.harnessPlatform.inbox = null));
  await gmail(page).locator('span[class*="title"]').hover();
  await expect(panel(page).getByText('Gmail didn’t answer. Open it to sign in.')).toBeVisible();
});
