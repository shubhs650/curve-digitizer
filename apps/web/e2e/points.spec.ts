import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { canvasView, graphProject, pageXY, sampleImage, SAMPLES, seedProject } from './fixtures';

// Task 1.4: manual points with magnetic snap on vector-clean. A2's accuracy is scored on the recorded clicks by
// test:samples; here the same clicks go through the real canvas, pixel read-back and snap.

type Vec2 = readonly [number, number];

const truth = JSON.parse(readFileSync(new URL('vector-clean/ground-truth.json', SAMPLES), 'utf8')) as {
  datasets: { id: string; centerline: Vec2[] }[];
};
const ops = JSON.parse(readFileSync(new URL('vector-clean/ops.json', SAMPLES), 'utf8')) as {
  ops: { id: string; clicks?: Vec2[] }[];
};
const CLICKS = ops.ops.find((o) => o.id === 'pick-d1')?.clicks?.slice(0, 3) ?? [];
const CENTERLINE = truth.datasets.find((d) => d.id === 'd1')?.centerline ?? [];

/** Distance from `p` to the d1 centreline polyline. */
function offCurve([x, y]: Vec2): number {
  let best = Infinity;
  for (let i = 1; i < CENTERLINE.length; i++) {
    const [ax, ay] = CENTERLINE[i - 1] ?? [0, 0];
    const [bx, by] = CENTERLINE[i] ?? [0, 0];
    const t = Math.max(
      0,
      Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)),
    );
    best = Math.min(best, Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)));
  }
  return best;
}

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
const panel = (page: Page) => page.getByRole('region', { name: 'Points' });
const selectionText = (page: Page) => panel(page).getByTestId('point-selection');

async function selectedPx(page: Page): Promise<[number, number]> {
  const text = (await selectionText(page).textContent()) ?? '';
  const match = /x (-?[\d.]+) px, y (-?[\d.]+) px/.exec(text);
  if (!match) throw new Error(`no single selected point: "${text}"`);
  return [Number(match[1]), Number(match[2])];
}

async function clickImage(page: Page, px: Vec2): Promise<void> {
  const [x, y] = await pageXY(page, px);
  await page.mouse.click(x, y);
}

test.describe('manual points', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await seedProject(page, graphProject('vector-clean', { width: 2400, height: 1600 }, [DATASET]), {
      'graphs/g1/original.png': sampleImage('vector-clean'),
    });
    await expect(canvas(page)).toHaveAttribute('data-state', 'ready');
  });

  test('clicks near a curve snap onto its centreline (A2 through the UI)', async ({ page }) => {
    await page.keyboard.press('p');
    await expect(page.getByRole('button', { name: 'Add points' })).toHaveAttribute('aria-pressed', 'true');
    for (const click of CLICKS) {
      await clickImage(page, click);
      await expect(selectionText(page)).toContainText('snapped');
      expect(offCurve(await selectedPx(page))).toBeLessThan(0.5);
    }
    await expect(page.getByRole('button', { name: /Pump A/ })).toContainText(String(CLICKS.length));
  });

  test('nudges with the arrow keys, undoes, and deletes', async ({ page }) => {
    await page.keyboard.press('p');
    await clickImage(page, CLICKS[0] ?? [0, 0]);
    await expect(selectionText(page)).toContainText('snapped');
    const placed = await selectedPx(page);
    await canvas(page).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    const nudged = await selectedPx(page);
    expect(nudged[0] - placed[0]).toBeCloseTo(1, 2);
    expect(nudged[1] - placed[1]).toBeCloseTo(0.1, 2);
    // Both nudges of the same selection are one undo step.
    await page.keyboard.press('Control+z');
    expect(await selectedPx(page)).toEqual(placed);
    await canvas(page).focus();
    await page.keyboard.press('Delete');
    await expect(selectionText(page)).toHaveText('No points selected.');
    await expect(page.getByRole('button', { name: /Pump A/ })).toContainText('0');
  });

  test('drags a point and box-selects with the select tool', async ({ page }) => {
    await page.keyboard.press('s'); // snap off: the point should land where it is dropped
    await page.keyboard.press('p');
    await clickImage(page, [1200, 1000]);
    await clickImage(page, [1400, 1100]);
    await page.keyboard.press('v');
    const [x, y] = await pageXY(page, [1200, 1000]);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 20, y + 10, { steps: 4 });
    await page.mouse.up();
    const { view } = await canvasView(page);
    const moved = await selectedPx(page);
    expect(moved[0] - 1200).toBeCloseTo(20 / view.scale, 0);
    expect(moved[1] - 1000).toBeCloseTo(10 / view.scale, 0);

    const [bx, by] = await pageXY(page, [1100, 900]);
    const [ex, ey] = await pageXY(page, [1500, 1200]);
    await page.mouse.move(bx, by);
    await page.mouse.down();
    await page.mouse.move(ex, ey, { steps: 4 });
    await page.mouse.up();
    await expect(selectionText(page)).toHaveText('2 points selected.');
    await expect(panel(page).getByRole('button', { name: 'Delete 2 points' })).toBeVisible();
  });

  test('passes axe with a point selected', async ({ page }) => {
    await page.keyboard.press('p');
    await clickImage(page, CLICKS[0] ?? [0, 0]);
    await expect(selectionText(page)).toContainText('snapped');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
