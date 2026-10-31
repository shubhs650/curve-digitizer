import { readFileSync } from 'node:fs';
import { type Page } from '@playwright/test';
import {
  axe,
  expect,
  graphProject,
  pageXY,
  sampleImage,
  SAMPLES,
  seedProject,
  test,
  UNTRACED,
} from './fixtures';

// Task 2.5: the colour-mask tool on vector-clean through the real canvas, compute worker and panel. A5's
// recovery is scored by test:samples on the same pick; here it goes through the UI end to end.

type Vec2 = readonly [number, number];

const ops = JSON.parse(readFileSync(new URL('vector-clean/ops.json', SAMPLES), 'utf8')) as {
  ops: { id: string; pick?: Vec2 }[];
};
const PICK = ops.ops.find((o) => o.id === 'mask-d1')?.pick ?? [0, 0];

const DATASET = {
  id: 'd1',
  name: 'Pump A',
  color: '#0072b2',
  mode: 'function',
  xUnit: '',
  yUnit: '',
  sourceRef: '',
  notes: '',
  points: [],
};

const canvas = (page: Page) => page.getByRole('application', { name: /^Graph image: vector-clean/ });
const panel = (page: Page) => page.getByRole('region', { name: 'Colour mask' });

/** Main-thread tasks over 100 ms since the observer started (P5). */
const longTasks = (page: Page) =>
  page.evaluate(() => (window as unknown as { longTasks: number[] }).longTasks.filter((d) => d > 100));

test.use(UNTRACED);

test.describe('colour mask', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await seedProject(page, graphProject('vector-clean', { width: 2400, height: 1600 }, [DATASET]), {
      'graphs/g1/original.png': sampleImage('vector-clean'),
    });
    await expect(canvas(page)).toHaveAttribute('data-state', 'ready');
  });

  test('finds the picked curve off the main thread and adds its points in one undo step', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const w = window as unknown as { longTasks: number[] };
      w.longTasks = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) w.longTasks.push(entry.duration);
      }).observe({ type: 'longtask' });
    });
    await page.keyboard.press('m');
    await expect(page.getByRole('button', { name: 'Colour mask', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const [x, y] = await pageXY(page, PICK);
    await page.mouse.click(x, y);

    const curves = panel(page).getByRole('list', { name: 'Curves found' });
    await expect(curves).toBeVisible({ timeout: 15_000 });
    // The three pump curves have different colours: the blue one is the longest blue component, and kept.
    const first = curves.getByRole('checkbox').first();
    await expect(first).toBeChecked();
    await expect(curves.getByRole('checkbox', { checked: true })).toHaveCount(1);
    const label =
      (await first.getAttribute('aria-label')) ?? (await curves.getByRole('listitem').first().textContent());
    expect(Number(/(\d+) px long/.exec(label ?? '')?.[1])).toBeGreaterThan(2000);
    await expect(panel(page).getByText(/^Curve colour #[0-9a-f]{6}$/)).toBeVisible();
    expect(await longTasks(page)).toEqual([]);
    expect((await axe(page).analyze()).violations).toEqual([]);
    // axe itself runs on the main thread.
    await page.evaluate(() => {
      (window as unknown as { longTasks: number[] }).longTasks = [];
    });

    const add = panel(page).getByRole('button', { name: /^Add \d+ points to Pump A$/ });
    const count = Number(/Add (\d+)/.exec((await add.textContent()) ?? '')?.[1]);
    expect(count).toBeGreaterThan(300);
    await add.click();
    await expect(page.getByRole('button', { name: /Pump A/ })).toContainText(String(count));
    await expect(curves).toHaveCount(0);

    expect(await longTasks(page)).toEqual([]);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByRole('button', { name: /Pump A/ })).toContainText('0');
  });

  test('a click on the paper says so and keeps the tool ready', async ({ page }) => {
    await page.keyboard.press('m');
    const [x, y] = await pageXY(page, [1200, 1500]);
    await page.mouse.click(x, y);
    await expect(panel(page).getByRole('alert')).toContainText('paper colour', { timeout: 15_000 });
  });
});
