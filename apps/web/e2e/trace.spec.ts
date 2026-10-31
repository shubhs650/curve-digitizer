import { readFileSync } from 'node:fs';
import { type Page } from '@playwright/test';
import { axe, expect, graphProject, pageXY, sampleImage, SAMPLES, seedProject, test } from './fixtures';

// Task 2.4: the guided trace tool on vector-clean through the real canvas, compute worker and panel, with the
// P4 timing (a 2000 px-wide curve in ≤ 1 s with ≥ 4 progress events/s) and P5 (no long task). A3's accuracy
// is scored by test:samples on the same picks.

type Vec2 = readonly [number, number];

const ops = JSON.parse(readFileSync(new URL('vector-clean/ops.json', SAMPLES), 'utf8')) as {
  ops: { id: string; start?: Vec2; end?: Vec2 }[];
};
const op = ops.ops.find((o) => o.id === 'trace-d2');
const START = op?.start ?? [0, 0];
const END = op?.end ?? [0, 0];

const DATASET = {
  id: 'd1',
  name: 'Pump B',
  color: '#0072b2',
  mode: 'function',
  xUnit: '',
  yUnit: '',
  sourceRef: '',
  notes: '',
  points: [],
};

const canvas = (page: Page) => page.getByRole('application', { name: /^Graph image: vector-clean/ });
const panel = (page: Page) => page.getByRole('region', { name: 'Guided trace' });

async function clickImage(page: Page, px: Vec2): Promise<void> {
  const [x, y] = await pageXY(page, px);
  await page.mouse.click(x, y);
}

/** The last run's duration (ms) and progress events, from the app's performance marks. */
function lastRun(page: Page) {
  return page.evaluate(() => {
    const starts = performance.getEntriesByName('trace:start');
    const ends = performance.getEntriesByName('trace:end');
    const t0 = starts.at(-1)?.startTime ?? 0;
    const t1 = ends.at(-1)?.startTime ?? 0;
    const events = performance
      .getEntriesByName('trace:progress')
      .filter((e) => e.startTime >= t0 && e.startTime <= t1).length;
    return { ms: t1 - t0, events };
  });
}

test.describe('guided trace', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await seedProject(page, graphProject('vector-clean', { width: 2400, height: 1600 }, [DATASET]), {
      'graphs/g1/original.png': sampleImage('vector-clean'),
    });
    await expect(canvas(page)).toHaveAttribute('data-state', 'ready');
    await page.evaluate(() => {
      const w = window as unknown as { longTasks: number[] };
      w.longTasks = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) w.longTasks.push(entry.duration);
      }).observe({ type: 'longtask' });
    });
  });

  test('traces a 2000 px curve from start to end pick in ≤ 1 s with live progress (P4, P5)', async ({
    page,
  }) => {
    await page.keyboard.press('t');
    await expect(page.getByRole('button', { name: 'Guided trace', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await clickImage(page, START);
    await expect(panel(page).getByRole('button', { name: 'Trace to the curve ends' })).toBeVisible();
    await clickImage(page, END);
    await expect(panel(page).getByText(/^Traced\./)).toBeVisible({ timeout: 15_000 });

    const run = await lastRun(page);
    test.info().annotations.push({
      type: 'P4',
      description: `${run.ms.toFixed(0)} ms, ${String(run.events)} progress events`,
    });
    expect(END[0] - START[0]).toBeGreaterThan(1800);
    expect(run.ms).toBeLessThanOrEqual(1000);
    expect((run.events * 1000) / run.ms).toBeGreaterThanOrEqual(4);
    const longTasks = await page.evaluate(() =>
      (window as unknown as { longTasks: number[] }).longTasks.filter((d) => d > 100),
    );
    expect(longTasks).toEqual([]);
    expect((await axe(page).analyze()).violations).toEqual([]);

    const add = panel(page).getByRole('button', { name: /^Add \d+ points to Pump B$/ });
    const count = Number(/Add (\d+)/.exec((await add.textContent()) ?? '')?.[1]);
    expect(count).toBeGreaterThan(300);
    await add.click();
    await expect(page.getByRole('button', { name: /Pump B/ })).toContainText(String(count));
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByRole('button', { name: /Pump B/ })).toContainText('0');
  });

  test('Esc cancels the picks, and a click on the paper says there is no curve', async ({ page }) => {
    await page.keyboard.press('t');
    await clickImage(page, START);
    await expect(panel(page).getByRole('button', { name: 'Trace to the curve ends' })).toBeVisible();
    await canvas(page).press('Escape');
    await expect(panel(page).getByText('Click the curve where the trace should start.')).toBeVisible();
    await clickImage(page, [1200, 1500]);
    await panel(page).getByRole('button', { name: 'Trace to the curve ends' }).click();
    await expect(panel(page).getByRole('alert')).toContainText('No curve', { timeout: 15_000 });
  });
});
