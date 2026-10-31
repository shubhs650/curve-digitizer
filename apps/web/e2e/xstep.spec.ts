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

// Task 2.6: X-step sampling on vector-clean through the real canvas, compute worker and panel, by step and by
// list, with P5 (no long task). A6's accuracy is scored by test:samples on the same picks.

type Vec2 = readonly [number, number];

const truth = JSON.parse(readFileSync(new URL('vector-clean/ground-truth.json', SAMPLES), 'utf8')) as {
  pxToAxis: number[];
};
const ops = JSON.parse(readFileSync(new URL('vector-clean/ops.json', SAMPLES), 'utf8')) as {
  ops: { id: string; start?: Vec2 }[];
};
const START = ops.ops.find((o) => o.id === 'xstep-d2')?.start ?? [0, 0];

const DATASET = {
  id: 'd1',
  name: 'Pump B',
  color: '#ff7f0e',
  mode: 'function',
  xUnit: 'm³/h',
  yUnit: 'm',
  sourceRef: '',
  notes: '',
  points: [],
};

const project = graphProject('vector-clean', { width: 2400, height: 1600 }, [DATASET]);
const calibrated = {
  ...project,
  graphs: project.graphs.map((g) => ({
    ...g,
    calibration: {
      xAxis: { type: 'linear', label: 'Flow rate Q', unit: 'm³/h' },
      yAxis: { type: 'linear', label: 'Head H', unit: 'm' },
      model: 'affine',
      points: [],
      matrix: truth.pxToAxis,
      residualPx: 0,
      resolution: { xUnitsPerPx: 0.047, yUnitsPerPx: 0.045 },
      warnings: [],
    },
  })),
};

const canvas = (page: Page) => page.getByRole('application', { name: /^Graph image: vector-clean/ });
const panel = (page: Page) => page.getByRole('region', { name: 'X-step' });

async function clickImage(page: Page, px: Vec2): Promise<void> {
  const [x, y] = await pageXY(page, px);
  await page.mouse.click(x, y);
}

test.use(UNTRACED);

test.describe('X-step', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await seedProject(page, calibrated, { 'graphs/g1/original.png': sampleImage('vector-clean') });
    await expect(canvas(page)).toHaveAttribute('data-state', 'ready');
    await page.evaluate(() => {
      const w = window as unknown as { longTasks: number[] };
      w.longTasks = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) w.longTasks.push(entry.duration);
      }).observe({ type: 'longtask' });
    });
  });

  test('samples a curve every 10 m³/h and adds the points, undoably (P5)', async ({ page }) => {
    await panel(page).getByRole('textbox', { name: 'From' }).fill('10');
    await panel(page).getByRole('textbox', { name: 'To' }).fill('90');
    await panel(page).getByRole('textbox', { name: 'Step' }).fill('10');
    await expect(panel(page).getByText('9 X values in m³/h')).toBeVisible();
    // Focus is in a text field, where X types; the panel's button picks the tool instead.
    await panel(page).getByRole('button', { name: 'X-step (X)' }).click();
    await expect(page.getByRole('button', { name: 'X-step', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await clickImage(page, START);
    await expect(panel(page).getByRole('status')).toHaveText('9 points.', { timeout: 15_000 });
    const longTasks = await page.evaluate(() =>
      (window as unknown as { longTasks: number[] }).longTasks.filter((d) => d > 100),
    );
    expect(longTasks).toEqual([]);
    expect((await axe(page).analyze()).violations).toEqual([]);

    await panel(page).getByRole('button', { name: 'Add 9 points to Pump B' }).click();
    await expect(page.getByRole('button', { name: /Pump B/ })).toContainText('9');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByRole('button', { name: /Pump B/ })).toContainText('0');
  });

  test('takes a list, says which X values the curve misses, and Esc clears', async ({ page }) => {
    await panel(page).getByRole('radio', { name: 'List' }).check();
    await panel(page).getByLabel('X values (commas, spaces or new lines)').fill('20, 50 80\n99');
    await expect(panel(page).getByText('4 X values in m³/h')).toBeVisible();
    await canvas(page).press('x');
    await clickImage(page, START);
    await expect(panel(page).getByRole('status')).toHaveText(
      '3 points. The curve does not reach 1 X value.',
      { timeout: 15_000 },
    );
    await canvas(page).press('Escape');
    await expect(panel(page).getByText('Click the curve to sample.')).toBeVisible();
  });
});
