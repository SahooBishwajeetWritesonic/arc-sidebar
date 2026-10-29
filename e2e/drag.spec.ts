import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');

// The harness seeds: Pinned = Gmail, Calendar, Dev (Linear, GitHub);
// Today = Engineering Wiki, Figma, chrome.sidePanel docs, YouTube.

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

async function ready(page: Page) {
  await page.goto('/');
  await expect(panel(page).locator('[data-active-page] [data-nav-row="folder"]')).toHaveCount(1);
  await expect(panel(page).locator('[data-active-page] [data-nav-row="tab"]')).toHaveCount(4);
}

const row = (page: Page, title: string) =>
  panel(page).locator('[data-active-page] [data-nav-row]', { hasText: title }).first();

/** Presses a row, moves to a fraction of another row's height, releases. */
async function drag(page: Page, from: string, to: string, fraction: number) {
  const source = (await row(page, from).boundingBox())!;
  const target = (await row(page, to).boundingBox())!;
  await page.mouse.move(source.x + 60, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x + 60, source.y + source.height / 2 + 8, { steps: 4 });
  await page.mouse.move(target.x + 60, target.y + target.height * fraction, { steps: 12 });
  await page.mouse.up();
}

test('pins a Today tab by dragging it between two pinned tabs', async ({ page }) => {
  await ready(page);
  await drag(page, 'Engineering Wiki', 'Google Calendar', 0.25);
  await expect
    .poll(() => rows(page))
    .toEqual([
      'pin:0:Inbox (3) - Gmail',
      'pin:0:Engineering Wiki',
      'pin:0:Google Calendar - ',
      'folder:0:Dev',
      'pin:1:My issues · Linear',
      'pin:1:Pull requests · Gi',
      'newtab:0:New Tab',
      'tab:0:Sidebar exploratio',
      'tab:0:chrome.sidePanel |',
      'tab:0:Lo-fi beats to cod',
    ]);
});

test('unpins a tab by dragging it to the top of Today', async ({ page }) => {
  await ready(page);
  await drag(page, 'Google Calendar', 'New Tab', 0.5);
  // The pinned row fades out (100 ms) while the Today row is already in place.
  await expect.poll(() => rows(page)).not.toContain('pin:0:Google Calendar - ');
  const order = await rows(page);
  expect(order.indexOf('tab:0:Google Calendar - ')).toBe(order.indexOf('newtab:0:New Tab') + 1);
});

test('drops a tab into a folder from the folder’s middle', async ({ page }) => {
  await ready(page);
  await drag(page, 'Sidebar explorations', 'Dev', 0.5);
  await expect.poll(() => rows(page)).toContain('pin:1:Sidebar exploratio');
  const order = await rows(page);
  expect(order.indexOf('pin:1:Sidebar exploratio')).toBe(
    order.indexOf('pin:1:Pull requests · Gi') + 1,
  );
});

test('reorders Today', async ({ page }) => {
  await ready(page);
  await drag(page, 'Lo-fi beats', 'Engineering Wiki', 0.2);
  await expect
    .poll(async () => (await rows(page)).filter((r) => r.startsWith('tab:')))
    .toEqual([
      'tab:0:Lo-fi beats to cod',
      'tab:0:Engineering Wiki',
      'tab:0:Sidebar exploratio',
      'tab:0:chrome.sidePanel |',
    ]);
});

test('Escape cancels a drag, and the list never moves during one', async ({ page }) => {
  await ready(page);
  const before = await rows(page);
  const source = (await row(page, 'Engineering Wiki').boundingBox())!;
  await page.mouse.move(source.x + 60, source.y + 20);
  await page.mouse.down();
  await page.mouse.move(source.x + 60, source.y - 120, { steps: 10 });
  await expect(panel(page).locator('[data-drop-line]')).toHaveCount(1);
  expect(await rows(page)).toEqual(before);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(panel(page).locator('[data-drop-line]')).toHaveCount(0);
  expect(await rows(page)).toEqual(before);
});

test('a folder only toggles on a click, not when dragged', async ({ page }) => {
  await ready(page);
  await drag(page, 'Dev', 'Inbox (3)', 0.2);
  await expect.poll(() => rows(page)).toEqual(expect.arrayContaining(['pin:1:My issues · Linear']));
  expect((await rows(page))[0]).toBe('folder:0:Dev');
  await row(page, 'Dev').click();
  await expect.poll(() => rows(page)).not.toContain('pin:1:My issues · Linear');
});

test('choosing from a row’s menu doesn’t also press the row', async ({ page }) => {
  await ready(page);
  await row(page, 'Dev').click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Rename…' }).click();
  await expect(panel(page).getByRole('textbox')).toBeFocused();
  // Renaming hides the title, so find the folder by its kind.
  const folder = panel(page).locator('[data-active-page] [data-nav-row="folder"]');
  await expect(folder).toHaveAttribute('data-open');
  await page.keyboard.press('Escape');

  // Closing another pinned tab from its menu doesn't select it first.
  await row(page, 'Google Calendar').click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Close Tab' }).click();
  await expect(row(page, 'Inbox (3)')).toHaveAttribute('data-selected');
});

test('Alt+Down moves a pinned tab with the keyboard', async ({ page }) => {
  await ready(page);
  await row(page, 'Inbox (3)').focus();
  await page.keyboard.press('Alt+ArrowDown');
  await expect
    .poll(async () => (await rows(page)).slice(0, 2))
    .toEqual(['pin:0:Google Calendar - ', 'pin:0:Inbox (3) - Gmail']);
  await expect(row(page, 'Inbox (3)')).toBeFocused();
});
