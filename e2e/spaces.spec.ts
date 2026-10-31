import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');

// The harness seeds one space: Pinned = Gmail (active), Calendar, Dev (Linear,
// GitHub); Today = Engineering Wiki, Figma, chrome.sidePanel docs, YouTube.

async function titles(page: Page, kind: 'tab' | 'pin') {
  return panel(page)
    .locator(`[data-active-page] [data-nav-row="${kind}"]`)
    .evaluateAll((elements) =>
      elements.map(
        (el) => el.querySelector('span[class*="title"]')?.textContent?.slice(0, 16) ?? '',
      ),
    );
}

async function ready(page: Page) {
  await page.goto('/');
  await expect(panel(page).locator('[data-active-page] [data-nav-row="folder"]')).toHaveCount(1);
  await expect(panel(page).locator('[data-active-page] [data-nav-row="tab"]')).toHaveCount(4);
}

async function newSpace(page: Page, name: string) {
  await panel(page).getByRole('button', { name: 'More', exact: true }).click();
  // In the + menu: a space's own menu, still fading out, has New Space too.
  await panel(page)
    .getByRole('menu', { name: 'More' })
    .getByRole('menuitem', { name: 'New Space' })
    .click();
  const field = panel(page).getByRole('textbox', { name: 'Name' });
  await field.fill(name);
  await field.press('Enter');
}

test('a new space starts empty with a new tab, and switching back restores the first', async ({
  page,
}) => {
  await ready(page);
  await newSpace(page, 'Work');
  await expect(panel(page).getByText('Work', { exact: true })).toBeVisible();
  await expect.poll(() => titles(page, 'pin')).toEqual([]);
  await expect.poll(() => titles(page, 'tab')).toEqual(['New Tab']);

  await panel(page).getByRole('button', { name: 'Space', exact: true }).click();
  await expect.poll(() => titles(page, 'tab')).toHaveLength(4);
  await expect.poll(() => titles(page, 'pin')).toHaveLength(4);
  // The tab last used there (Gmail) is selected again.
  await expect(
    panel(page).locator('[data-active-page] [data-nav-row="pin"][data-selected]'),
  ).toContainText('Gmail');
});

test('moves a Today tab to another space from its menu', async ({ page }) => {
  await ready(page);
  await newSpace(page, 'Work');
  await panel(page).getByRole('button', { name: 'Space', exact: true }).click();
  await expect.poll(() => titles(page, 'tab')).toHaveLength(4);

  await panel(page)
    .locator('[data-nav-row="tab"]', { hasText: 'Engineering Wiki' })
    .click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Move to Space' }).hover();
  await panel(page).getByRole('menuitem', { name: 'Work' }).click();
  await expect.poll(() => titles(page, 'tab')).not.toContain('Engineering Wiki');

  await panel(page).getByRole('button', { name: 'Work', exact: true }).click();
  await expect.poll(() => titles(page, 'tab')).toContain('Engineering Wiki');
});

test('⌃1 and ⌃2 switch spaces when the panel has focus', async ({ page }) => {
  await ready(page);
  await newSpace(page, 'Work');
  await expect.poll(() => titles(page, 'pin')).toEqual([]);
  await panel(page).locator('[data-active-page] [data-nav-row="tab"]').first().focus();
  await page.keyboard.press('Control+1');
  await expect.poll(() => titles(page, 'pin')).toHaveLength(4);
  await panel(page).locator('[data-active-page] [data-nav-row="pin"]').first().focus();
  await page.keyboard.press('Control+2');
  await expect.poll(() => titles(page, 'pin')).toEqual([]);
});

test('deleting a space can be undone', async ({ page }) => {
  await ready(page);
  await panel(page)
    .locator('[data-active-page] [class*="header"]')
    .first()
    .click({ button: 'right' });
  await expect(panel(page).getByRole('menuitem', { name: 'Delete Space' })).toHaveCount(0);
  await page.keyboard.press('Escape');

  await newSpace(page, 'Work');
  await panel(page).getByText('Work', { exact: true }).click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Delete Space' }).click();
  await expect(panel(page).getByRole('navigation', { name: 'Spaces' })).toHaveCount(0);
  await panel(page).getByRole('button', { name: 'Undo' }).click();
  await expect(panel(page).getByRole('button', { name: 'Work', exact: true })).toBeVisible();
});

/**
 * A two-finger horizontal swipe: small wheel events, then the fingers lift.
 * `fromBottom` swipes that far above the panel's bottom edge instead of over the rows.
 */
async function swipe(page: Page, direction: 'left' | 'right', fromBottom?: number) {
  const box = (await page.locator('iframe[title="Sidebar"]').boundingBox())!;
  const y = fromBottom === undefined ? box.y + 200 : box.y + box.height - fromBottom;
  await page.mouse.move(box.x + box.width / 2, y);
  const step = direction === 'left' ? 6 : -6; // swiping left scrolls right (positive deltaX)
  for (let i = 0; i < 20; i++) {
    await page.mouse.wheel(step, 0);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(700); // the gesture ends after a quiet moment
}

test('swiping left goes to the next space and right comes back', async ({ page }) => {
  await ready(page);
  await newSpace(page, 'Work');
  await panel(page).getByRole('button', { name: 'Space', exact: true }).click();
  await expect.poll(() => titles(page, 'pin')).toHaveLength(4);

  await swipe(page, 'left');
  await expect(panel(page).locator('[data-active-page]')).toHaveAttribute('aria-label', 'Work');
  await swipe(page, 'right');
  await expect(panel(page).locator('[data-active-page]')).toHaveAttribute('aria-label', 'Space');
});

test('swiping right from the first space opens the Library on the archive; left closes it', async ({
  page,
}) => {
  await ready(page);
  const library = panel(page).getByRole('region', { name: 'Library' });
  await swipe(page, 'right');
  await expect(library).toBeVisible();
  await expect(library.getByRole('searchbox', { name: 'Search archived tabs' })).toBeVisible();
  await expect(library.getByRole('button', { name: 'Archived Tabs' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await swipe(page, 'left');
  await expect(library).toHaveCount(0);
  await expect(panel(page).locator('[data-active-page]')).toHaveAttribute('aria-label', 'Space');

  await panel(page).getByRole('button', { name: 'Archive', exact: true }).click();
  await library.getByRole('button', { name: 'Back to sidebar' }).click();
  await expect(library).toHaveCount(0);
});

test('swiping works anywhere in the sidebar, not only over the rows', async ({ page }) => {
  await ready(page);
  await newSpace(page, 'Work');
  await panel(page).getByRole('button', { name: 'Space', exact: true }).click();
  await expect.poll(() => titles(page, 'pin')).toHaveLength(4);

  await swipe(page, 'left', 120); // the empty area below the rows
  await expect(panel(page).locator('[data-active-page]')).toHaveAttribute('aria-label', 'Work');
  await swipe(page, 'right', 20); // the bottom bar
  await expect(panel(page).locator('[data-active-page]')).toHaveAttribute('aria-label', 'Space');
});

test('swiping past the last space springs back, and vertical scrolling never switches', async ({
  page,
}) => {
  await ready(page);
  await newSpace(page, 'Work');
  await swipe(page, 'left'); // already on the last space
  await expect(panel(page).locator('[data-active-page]')).toHaveAttribute('aria-label', 'Work');

  const box = (await page.locator('iframe[title="Sidebar"]').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 200);
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, -8);
  await page.waitForTimeout(600);
  await expect(panel(page).locator('[data-active-page]')).toHaveAttribute('aria-label', 'Work');
});

const pinRows = (page: Page) =>
  panel(page).locator(
    '[data-active-page] [data-nav-row="pin"], [data-active-page] [data-nav-row="folder"]',
  );

test('the caret on the space’s name folds Pinned away, keeping the selected tab', async ({
  page,
}) => {
  await ready(page);
  await expect(pinRows(page)).toHaveCount(5);
  const header = panel(page).locator('[data-active-page] [data-space-header]');
  await header.hover();
  await header.getByRole('button', { name: 'Collapse Pinned' }).click();
  await expect(header).toHaveAttribute('data-collapsed');
  // Gmail is selected, so it stays.
  await expect.poll(() => titles(page, 'pin')).toEqual(['Inbox (3) - Gmai']);
  await expect(pinRows(page)).toHaveCount(1);

  // Remembered, and back from the space's menu.
  await page.reload();
  await expect(pinRows(page)).toHaveCount(1);
  await header.click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Expand Pinned' }).click();
  await expect(pinRows(page)).toHaveCount(5);
});

const spaceOrder = (page: Page) =>
  panel(page)
    .getByRole('navigation', { name: 'Spaces' })
    .getByRole('button')
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')));

test('dragging a space’s icon sideways reorders the spaces; so does ⌥← and ⌥→', async ({
  page,
}) => {
  await ready(page);
  await newSpace(page, 'Work');
  await newSpace(page, 'Home');
  await expect.poll(() => spaceOrder(page)).toEqual(['Space', 'Work', 'Home']);

  const icon = (name: string) =>
    panel(page).getByRole('navigation', { name: 'Spaces' }).getByRole('button', { name });
  const from = (await icon('Work').boundingBox())!;
  const to = (await icon('Space').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 4, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => spaceOrder(page)).toEqual(['Work', 'Space', 'Home']);
  // Home stays shown: a drag doesn't switch to the space dragged.
  await page.waitForTimeout(100);
  await expect(panel(page).locator('[data-active-page]')).toHaveAttribute('aria-label', 'Home');

  await icon('Home').focus();
  await page.keyboard.press('Alt+ArrowLeft');
  await expect.poll(() => spaceOrder(page)).toEqual(['Work', 'Home', 'Space']);
  await expect(icon('Home')).toBeFocused();
  await page.reload();
  await expect.poll(() => spaceOrder(page)).toEqual(['Work', 'Home', 'Space']);
});

test('the mouse’s back and forward buttons step through the spaces', async ({ page }) => {
  await ready(page);
  await newSpace(page, 'Work');
  const shown = panel(page).locator('[data-active-page]');
  await expect(shown).toHaveAttribute('aria-label', 'Work');
  const sidebar = panel(page).locator('[data-sidebar]');
  await sidebar.dispatchEvent('mouseup', { button: 3, bubbles: true });
  await expect(shown).toHaveAttribute('aria-label', 'Space');
  await sidebar.dispatchEvent('mouseup', { button: 4, bubbles: true });
  await expect(shown).toHaveAttribute('aria-label', 'Work');
});
