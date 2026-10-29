import { expect, test, type Page } from '@playwright/test';
import { measure, openHarness, panel, report, todayRows, type Measurement } from './measure';

// The plan's budget: ~150 rows drop no frames in daily actions or a storm of tab events; bulk
// actions on 200 rows may take one bounded long frame. PERF_ROWS=500 checks the headroom.
const ROWS = Number(process.env.PERF_ROWS) || 150;

/** Nothing over 50ms, and at most one missed vsync. */
function expectSmooth(m: Measurement) {
  expect(m.longFrames, 'no long animation frames').toEqual([]);
  expect(m.longestFrame).toBeLessThan(50);
}

async function warmUp(page: Page) {
  // The first time any code path runs it's compiled; measure warm, as in use.
  await page.getByRole('button', { name: 'Open tab', exact: true }).click();
  await page.waitForTimeout(800);
  await todayRows(page).first().locator('button[aria-label="Close tab"]').click({ force: true });
  await page.waitForTimeout(800);
}

test(`${ROWS} rows: daily interactions stay within a frame`, async ({ page }) => {
  const rendered = await openHarness(page, ROWS);
  console.log(`first render of ${ROWS} rows: ${rendered}ms`);
  await warmUp(page);

  const storm = await measure(
    page,
    () => page.evaluate(() => window.harnessPlatform.reloadAll()),
    2000,
  );
  report('every tab reloads at once', storm);

  const select = await measure(page, () => todayRows(page).nth(6).click());
  report('select another tab', select);

  const open = await measure(page, () =>
    page.getByRole('button', { name: 'Open tab', exact: true }).click(),
  );
  report('open a tab', open);

  const close = await measure(page, () =>
    todayRows(page).nth(1).locator('button[aria-label="Close tab"]').click({ force: true }),
  );
  report('close a tab', close);

  const folder = panel(page).locator('[data-active-page] [data-nav-row="folder"]').first();
  const collapse = await measure(page, () => folder.click());
  report('collapse a folder', collapse);
  const expand = await measure(page, () => folder.click());
  report('expand a folder', expand);

  const scroll = await measure(page, async () => {
    await todayRows(page).nth(3).hover();
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(16);
    }
  });
  report('scroll to the bottom', scroll);

  const drag = await measure(page, async () => {
    await page.mouse.wheel(0, -10_000);
    const box = (await todayRows(page).nth(2).boundingBox())!;
    const x = box.x + 80;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 30; i++) {
      await page.mouse.move(x, y + i * 14);
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
  });
  report('drag a tab 10 rows down', drag);

  await panel(page).getByRole('button', { name: 'More' }).click();
  await panel(page).getByRole('menuitem', { name: 'New Space' }).click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1200);
  const spaces = panel(page).getByRole('navigation', { name: 'Spaces' }).getByRole('button');
  const toFull = await measure(page, () => spaces.first().click(), 1500);
  report('switch to the full space', toFull);
  const toEmpty = await measure(page, () => spaces.last().click(), 1500);
  report('switch to an empty space', toEmpty);

  for (const m of [storm, select, open, close, collapse, expand, scroll, drag, toFull, toEmpty]) {
    expectSmooth(m);
  }
});

test('200 rows: Clear and its Undo stay bounded', async ({ page }) => {
  await openHarness(page, 200);
  await warmUp(page);
  const clear = await measure(page, () =>
    panel(page)
      .locator('[data-active-page]')
      .getByRole('button', { name: 'Clear', exact: true })
      .click(),
  );
  report('clear 200 tabs', clear);
  const undo = await measure(
    page,
    () => panel(page).getByRole('status').getByRole('button', { name: 'Undo' }).click(),
    2000,
  );
  report('undo the clear', undo);
  for (const m of [clear, undo]) {
    for (const frame of m.longFrames) expect(frame.duration).toBeLessThan(150);
  }
});

test('200 rows: memory and layers', async ({ page }) => {
  await openHarness(page, 200);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  const { usedSize } = await cdp.send('Runtime.getHeapUsage');
  const elements = await page
    .frameLocator('iframe[title="Sidebar"]')
    .locator('body')
    .evaluate(() => document.getElementsByTagName('*').length);
  let layers = -1;
  cdp.on('LayerTree.layerTreeDidChange', ({ layers: all }) => all && (layers = all.length));
  await cdp.send('LayerTree.enable');
  // Chrome reports the layer tree when it changes: hover a row to repaint.
  await todayRows(page).nth(1).hover();
  await page.waitForTimeout(500);
  const heap = usedSize / 1048576;
  console.log(
    `JS heap (whole harness page: panel, fake Chrome and service) ${heap.toFixed(1)}MB, ` +
      `panel elements ${elements} (${(elements / 204).toFixed(1)} per row), layers at rest ${layers}`,
  );
  expect(heap).toBeLessThan(64);
  expect(elements / 204).toBeLessThan(10);
  expect(layers, 'layers reported').toBeGreaterThan(0);
  expect(layers, 'no layer per row at rest').toBeLessThan(16);
});
