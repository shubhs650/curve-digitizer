import { type Page } from '@playwright/test';
import { canvasView, graphProject, pageXY, sampleImage, seedProject, expect, test } from './fixtures';

// Task 1.2: zoom/pan, overlay, hit-testing and loupe; no long task on the main thread while doing it.

const POINTS = [
  { id: 'p1', px: [600.5, 300.5] },
  { id: 'p2', px: [1200.5, 700.5] },
  { id: 'p3', px: [1800.5, 1000.5] },
].map((p) => ({
  ...p,
  value: [0, 0],
  sigma: [0, 0],
  excludedFromFit: false,
  outOfRange: false,
  origin: 'manual',
}));

const DATASET = {
  id: 'd1',
  name: 'Curve 1',
  color: '#1f77b4',
  mode: 'function',
  xUnit: '',
  yUnit: '',
  sourceRef: '',
  notes: '',
  points: POINTS,
};

const canvas = (page: Page) => page.getByRole('application', { name: /^Graph image: vector-clean/ });
const readout = (page: Page) => page.getByTestId('cursor-readout');

async function readoutXY(page: Page): Promise<[number, number]> {
  const text = (await readout(page).textContent()) ?? '';
  const match = /x (-?[\d.]+) px · y (-?[\d.]+) px/.exec(text);
  if (!match) throw new Error(`unexpected readout "${text}"`);
  return [Number(match[1]), Number(match[2])];
}

test.describe('canvas', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await seedProject(page, graphProject('vector-clean', { width: 2400, height: 1600 }, [DATASET]), {
      'graphs/g1/original.png': sampleImage('vector-clean'),
    });
    await expect(canvas(page)).toHaveAttribute('data-state', 'ready');
  });

  test('fits the image on open and zooms by keyboard and buttons', async ({ page }) => {
    const fitted = (await canvasView(page)).view.scale;
    expect(fitted).toBeLessThan(1);
    await canvas(page).focus();
    await page.keyboard.press('+');
    expect((await canvasView(page)).view.scale).toBeCloseTo(fitted * 1.25, 4);
    await page.keyboard.press('1');
    expect((await canvasView(page)).view.scale).toBe(1);
    await expect(page.getByTestId('zoom-percent')).toHaveText('100%');
    await page.getByRole('button', { name: 'Fit to window' }).click();
    expect((await canvasView(page)).view.scale).toBeCloseTo(fitted, 6);
    await page.getByRole('button', { name: 'Zoom out' }).click();
    expect((await canvasView(page)).view.scale).toBeCloseTo(fitted / 1.25, 6);
  });

  test('wheel zoom keeps the image point under the cursor', async ({ page }) => {
    // Wheel events report whole CSS px, so park the mouse on one.
    const [x, y] = (await pageXY(page, [1000, 800])).map(Math.round) as [number, number];
    await page.mouse.move(x, y);
    const before = await readoutXY(page);
    expect(Math.abs(before[0] - 1000)).toBeLessThan(2);
    const fitted = (await canvasView(page)).view.scale;
    for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -100);
    await expect.poll(async () => (await canvasView(page)).view.scale).toBeGreaterThan(fitted * 2);
    const after = await readoutXY(page);
    expect(Math.abs(after[0] - before[0])).toBeLessThan(0.2);
    expect(Math.abs(after[1] - before[1])).toBeLessThan(0.2);
  });

  test('pans with the pan tool, the middle button and the arrow keys', async ({ page }) => {
    const start = (await canvasView(page)).view.offset;
    await page.keyboard.press('h');
    await expect(page.getByRole('button', { name: 'Pan' })).toHaveAttribute('aria-pressed', 'true');
    const [x, y] = await pageXY(page, [1200, 800]);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 50, y + 30, { steps: 5 });
    await page.mouse.up();
    const panned = (await canvasView(page)).view.offset;
    expect(panned[0] - start[0]).toBeCloseTo(50, 0);
    expect(panned[1] - start[1]).toBeCloseTo(30, 0);

    await page.keyboard.press('v');
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(x - 50, y - 30, { steps: 5 });
    await page.mouse.up({ button: 'middle' });
    const back = (await canvasView(page)).view.offset;
    expect(back[0]).toBeCloseTo(start[0], 0);

    await canvas(page).focus();
    await page.keyboard.press('ArrowLeft');
    expect((await canvasView(page)).view.offset[0]).toBeCloseTo(back[0] + 40, 0);
  });

  test('draws points and hit-tests them under the cursor', async ({ page }) => {
    const [x, y] = await pageXY(page, [1200.5, 700.5]);
    await page.mouse.move(x + 3, y - 2);
    await expect(canvas(page)).toHaveAttribute('data-hovered', 'd1/p2');
    await page.mouse.move(x + 40, y + 40);
    await expect(canvas(page)).not.toHaveAttribute('data-hovered', /./);
    // The marker is drawn in the dataset colour at the point.
    const pixel = await page.evaluate(
      ([cx, cy]) => {
        const layer = document.querySelector<HTMLCanvasElement>('canvas[role="application"]');
        const rect = layer?.getBoundingClientRect();
        const ctx = layer?.getContext('2d');
        if (!layer || !rect || !ctx) return null;
        const ratio = layer.width / rect.width;
        return [...ctx.getImageData((cx - rect.left) * ratio, (cy - rect.top) * ratio, 1, 1).data];
      },
      [x, y] as const,
    );
    expect(pixel).toEqual([0x1f, 0x77, 0xb4, 255]);
  });

  test('shows the loupe with the cursor and toggles it with L', async ({ page }) => {
    const [x, y] = await pageXY(page, [600, 300]);
    await page.mouse.move(x, y);
    await expect(page.getByTestId('loupe')).toBeVisible();
    await page.keyboard.press('l');
    await expect(page.getByTestId('loupe')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Loupe' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('zooming, panning and hovering cause no long task (P5)', async ({ page }) => {
    await page.evaluate(() => {
      const w = window as unknown as { longTasks: number[] };
      w.longTasks = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) w.longTasks.push(entry.duration);
      }).observe({ type: 'longtask' });
    });
    const [x, y] = await pageXY(page, [1200, 800]);
    await page.mouse.move(x, y);
    for (let i = 0; i < 20; i++) await page.mouse.wheel(0, i < 10 ? -120 : 120);
    await page.keyboard.press('h');
    await page.mouse.down();
    await page.mouse.move(x + 200, y + 100, { steps: 30 });
    await page.mouse.up();
    await page.keyboard.press('v');
    for (let i = 0; i < 30; i++) await page.mouse.move(x - i * 10, y - i * 5);
    const longTasks = await page.evaluate(() => (window as unknown as { longTasks: number[] }).longTasks);
    expect(longTasks.filter((d) => d > 100)).toEqual([]);
  });
});
