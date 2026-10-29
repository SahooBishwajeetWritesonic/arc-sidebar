import { expect, type Page } from '@playwright/test';

/** The sidebar runs in a frame on the harness page, as in Chrome's side panel. */
export const panel = (page: Page) => page.frameLocator('iframe[title="Sidebar"]');
export const todayRows = (page: Page) =>
  panel(page).locator('[data-active-page] [data-nav-row="tab"]');

/** A 16px favicon, so runs don't depend on the network (Chrome's are local too). */
const FAVICON = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFklEQVR42mNk+M9QzzDAwMgwqmFUAwBc0Af/VUnSigAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Opens the harness with `today` rows in Today (it seeds 4 of its own) and
 * waits for them to render. Returns how long that took.
 */
export async function openHarness(page: Page, today: number) {
  await page.route(/google\.com\/s2\/favicons/, (route) =>
    route.fulfill({ body: FAVICON, contentType: 'image/png' }),
  );
  const started = Date.now();
  await page.goto(`/?tabs=${today - 4}`);
  await expect(todayRows(page)).toHaveCount(today, { timeout: 10_000 });
  const rendered = Date.now() - started;
  await page.waitForTimeout(1000); // let the first-run seed and timers settle
  return rendered;
}

/** A long-animation-frame entry, as far as it's used here (TypeScript doesn't have it yet). */
interface LongFrameEntry extends PerformanceEntry {
  scripts: { invoker: string; sourceFunctionName: string; duration: number }[];
}

export interface Measurement {
  /** The longest gap between two animation frames. */
  longestFrame: number;
  /** Frames that missed at least one vsync (over 25ms at 60Hz). */
  slowFrames: number;
  /** Long animation frames (over 50ms), with the script that ran in them. */
  longFrames: { duration: number; scripts: string[] }[];
}

/**
 * Runs `action` and records frame timing until `settle` ms after it. Pessimistic: this page
 * also runs the fake Chrome and the service, which get their own threads in Chrome.
 */
export async function measure(page: Page, action: () => Promise<unknown>, settle = 1200) {
  await page.evaluate(() => {
    const record = { gaps: [] as number[], long: [] as Measurement['longFrames'], on: true };
    (window as unknown as { perf: typeof record }).perf = record;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as LongFrameEntry[]) {
        record.long.push({
          duration: Math.round(entry.duration),
          scripts: entry.scripts.map(
            (s) => `${s.invoker} ${s.sourceFunctionName} ${Math.round(s.duration)}ms`,
          ),
        });
      }
    }).observe({ type: 'long-animation-frame' });
    let last = 0;
    const tick = (time: number) => {
      if (last) record.gaps.push(time - last);
      last = time;
      if (record.on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await action();
  await page.waitForTimeout(settle);
  const { gaps, long } = await page.evaluate(() => {
    const record = (
      window as unknown as {
        perf: { gaps: number[]; long: Measurement['longFrames']; on: boolean };
      }
    ).perf;
    record.on = false;
    return { gaps: record.gaps, long: record.long };
  });
  return {
    longestFrame: Math.round(Math.max(...gaps)),
    slowFrames: gaps.filter((gap) => gap > 25).length,
    longFrames: long,
  } satisfies Measurement;
}

export function report(name: string, m: Measurement) {
  const long = m.longFrames.map((f) => `${f.duration}ms [${f.scripts.join(', ')}]`).join('; ');
  console.log(
    `${name.padEnd(28)} longest frame ${String(m.longestFrame).padStart(4)}ms, ` +
      `${m.slowFrames} slow${long ? `, long: ${long}` : ''}`,
  );
}
