import { expect, test, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');

async function ready(page: Page) {
  await page.goto('/?theme=dark');
  await expect(panel(page).locator('[data-active-page] [data-nav-row="tab"]')).toHaveCount(4);
}

async function openPicker(page: Page) {
  await panel(page).locator('[data-active-page] [data-space-header]').click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Edit Theme…' }).click();
  await expect(panel(page).getByRole('dialog')).toBeVisible();
}

/** The shown space's background layer (the most visible one). */
async function backdrop(page: Page) {
  return panel(page)
    .locator('[aria-hidden] > div')
    .evaluateAll((layers) => {
      const shown = layers.find((layer) => Number(getComputedStyle(layer).opacity) > 0.99);
      return shown ? getComputedStyle(shown).backgroundColor : '';
    });
}

const pageScheme = (page: Page) =>
  panel(page)
    .locator('[data-active-page]')
    .evaluate((el) => (el as HTMLElement).style.colorScheme);

test('picking a colour themes the space, and it is saved', async ({ page }) => {
  await ready(page);
  const before = await backdrop(page);
  expect(before).toBe('rgb(54, 55, 58)'); // Arc's default dark neutral

  await openPicker(page);
  await panel(page).getByRole('button', { name: 'Muted #7fb2d8' }).click();
  await expect.poll(() => backdrop(page)).not.toBe(before);
  const themed = await backdrop(page);
  await page.keyboard.press('Escape');
  await expect(panel(page).getByRole('dialog')).toHaveCount(0);

  // Closing the picker saves; wait for the fake Chrome's storage to have it.
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('harness:model') ?? ''))
    .toContain('"theme"');
  await page.reload();
  await expect(panel(page).locator('[data-active-page] [data-nav-row="tab"]')).toHaveCount(4);
  await expect.poll(() => backdrop(page)).toBe(themed);
});

test('a bright theme in dark mode switches that space to dark text', async ({ page }) => {
  await ready(page);
  expect(await pageScheme(page)).toBe('dark');
  await openPicker(page);
  await panel(page).getByRole('button', { name: 'Next colours' }).click();
  await panel(page).getByRole('button', { name: 'Pastel #fdfbfa' }).click();
  await panel(page).getByRole('slider', { name: 'Intensity' }).focus();
  await page.keyboard.press('End');
  await expect.poll(() => pageScheme(page)).toBe('light');
});

test('removing every colour goes back to the default', async ({ page }) => {
  await ready(page);
  await openPicker(page);
  await panel(page).getByRole('button', { name: 'Muted #d9615f' }).click();
  await panel(page).getByRole('button', { name: 'Add colour' }).click();
  await expect.poll(() => backdrop(page)).not.toBe('rgb(54, 55, 58)');
  // As in Arc, removing every colour goes back to the default theme.
  const remove = panel(page).getByRole('button', { name: 'Remove colour' });
  await remove.click();
  await remove.click();
  await expect(remove).toBeDisabled();
  await expect.poll(() => backdrop(page)).toBe('rgb(54, 55, 58)');
});

test('the harmony glyph cycles arrangements and linked dots move together', async ({ page }) => {
  await ready(page);
  await openPicker(page);
  await panel(page).getByRole('button', { name: 'Muted #7fb2d8' }).click();
  await panel(page).getByRole('button', { name: 'Add colour' }).click();
  await panel(page).getByRole('button', { name: 'Add colour' }).click();

  const glyph = panel(page).getByRole('button', { name: /^Colour harmony:/ });
  await expect(glyph).toHaveAccessibleName('Colour harmony: Analog');
  await glyph.click();
  await expect(glyph).toHaveAccessibleName('Colour harmony: Split');
  await glyph.click();
  await expect(glyph).toHaveAccessibleName('Colour harmony: Triad');

  // Linked: dragging the main dot moves all three.
  const dots = panel(page).locator(
    'button[aria-label="Main colour"], button[aria-label="Colour 2"], button[aria-label="Colour 3"]',
  );
  const centres = () =>
    dots.evaluateAll((elements) =>
      elements.map((el) => {
        const r = el.getBoundingClientRect();
        return `${Math.round(r.x)},${Math.round(r.y)}`;
      }),
    );
  await page.waitForTimeout(350); // let the glide finish
  const before = await centres();
  const main = (await panel(page).getByRole('button', { name: 'Main colour' }).boundingBox())!;
  await page.mouse.move(main.x + main.width / 2, main.y + main.height / 2);
  await page.mouse.down();
  await page.mouse.move(main.x - 40, main.y + 60, { steps: 6 });
  await page.mouse.up();
  const after = await centres();
  expect(after).toHaveLength(3);
  after.forEach((centre, i) => expect(centre).not.toBe(before[i]));

  // Free: dragging the main dot leaves the others where they are.
  await glyph.click();
  await expect(glyph).toHaveAccessibleName('Colour harmony: Free');
  await page.waitForTimeout(350);
  const freeBefore = await centres();
  const main2 = (await panel(page).getByRole('button', { name: 'Main colour' }).boundingBox())!;
  await page.mouse.move(main2.x + main2.width / 2, main2.y + main2.height / 2);
  await page.mouse.down();
  await page.mouse.move(main2.x + 30, main2.y - 30, { steps: 6 });
  await page.mouse.up();
  const freeAfter = await centres();
  expect(freeAfter[0]).not.toBe(freeBefore[0]);
  expect(freeAfter.slice(1)).toEqual(freeBefore.slice(1));
});

test('a space’s theme can be used for all spaces, with Undo', async ({ page }) => {
  await ready(page);
  await panel(page).getByRole('button', { name: 'More', exact: true }).click();
  await panel(page)
    .getByRole('menu', { name: 'More' })
    .getByRole('menuitem', { name: 'New Space' })
    .click();
  await panel(page).getByRole('textbox', { name: 'Name' }).fill('Work');
  await page.keyboard.press('Enter');
  await openPicker(page);
  await panel(page).getByRole('button', { name: 'Muted #7fb2d8' }).click();
  await page.keyboard.press('Escape');
  await expect(panel(page).getByRole('dialog')).toHaveCount(0);

  const themes = () =>
    page.evaluate(() =>
      (JSON.parse(localStorage.getItem('harness:model') ?? '{}').spaces ?? []).map(
        (space: { theme?: { colors: string[] } }) => space.theme?.colors[0] ?? null,
      ),
    );
  await expect.poll(themes).toEqual([null, '#7fb2d8']);
  await panel(page).locator('[data-active-page] [data-space-header]').click({ button: 'right' });
  await panel(page).getByRole('menuitem', { name: 'Use Theme for All Spaces' }).click();
  await expect.poll(themes).toEqual(['#7fb2d8', '#7fb2d8']);
  await panel(page).getByRole('button', { name: 'Undo' }).click();
  await expect.poll(themes).toEqual([null, '#7fb2d8']);
});
