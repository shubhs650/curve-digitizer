import { readFileSync } from 'node:fs';
import { type Page } from '@playwright/test';
import { axe, expect, graphProject, sampleImage, SAMPLES, seedProject, test } from './fixtures';

// Task 3.2: the fit panel on vector-clean's Pump B (H = 38·e^(−0.012 Q)) through the real dock, compute worker
// and canvas, with P5 (no long task while fitting).

type Vec2 = readonly [number, number];

const truth = JSON.parse(readFileSync(new URL('vector-clean/ground-truth.json', SAMPLES), 'utf8')) as {
  pxToAxis: number[];
  datasets: { id: string; samples: { value: Vec2; px: Vec2 }[] }[];
};
const samples = truth.datasets.find((d) => d.id === 'd2')?.samples ?? [];
const COLOR = '#ff7f0e';

const DATASET = {
  id: 'd2',
  name: 'Pump B',
  color: COLOR,
  mode: 'function',
  xUnit: 'm³/h',
  yUnit: 'm',
  sourceRef: '',
  notes: '',
  points: samples.map((s, i) => ({
    id: `p${String(i)}`,
    px: s.px,
    value: s.value,
    sigma: [0.03, 0.03],
    // One point is excluded to show that fits leave it out.
    excludedFromFit: i === 12,
    outOfRange: false,
    origin: 'manual',
  })),
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
const dock = (page: Page) => page.getByRole('region', { name: 'Data dock' });

/** Pixels of the overlay canvas painted exactly in the dataset colour. */
async function overlayPixels(page: Page): Promise<number> {
  return page.evaluate((hex) => {
    const target = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    let count = 0;
    for (const c of Array.from(document.querySelectorAll('canvas'))) {
      const ctx = c.getContext('2d');
      if (!ctx || c.width === 0) continue;
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      for (let i = 0; i < data.length; i += 4) {
        if (
          data[i] === target[0] &&
          data[i + 1] === target[1] &&
          data[i + 2] === target[2] &&
          data[i + 3] === 255
        )
          count++;
      }
    }
    return count;
  }, COLOR);
}

test.describe('Fit panel', () => {
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

  test('recommends the exponential, previews it, keeps it and draws it (P5)', async ({ page }) => {
    await dock(page).getByRole('tab', { name: 'Fit' }).click();
    await expect(dock(page).getByText('24 points, 1 excluded from fits')).toBeVisible();
    const before = await overlayPixels(page);
    await dock(page).getByRole('button', { name: 'Recommend fits' }).click();
    const list = dock(page).getByRole('radiogroup', { name: 'Recommended fits' });
    await expect(list.getByRole('radio')).toHaveCount(3, { timeout: 15_000 });
    const first = list.locator('.fui-Radio').first();
    await expect(first).toContainText('Exponential');
    await expect(first).toContainText('Recommended');
    await expect(
      dock(page).getByRole('img', { name: /^Residuals of Exponential y = .+: 24 points/ }),
    ).toBeVisible();
    await expect(dock(page).locator('[data-residual="excluded"]')).toHaveCount(1);
    const longTasks = await page.evaluate(() =>
      (window as unknown as { longTasks: number[] }).longTasks.filter((d) => d > 100),
    );
    expect(longTasks).toEqual([]);
    expect((await axe(page).analyze()).violations).toEqual([]);
    // The preview is drawn dashed; the kept fit solid, so it paints more of the dataset colour.
    const previewed = await overlayPixels(page);
    expect(previewed).toBeGreaterThan(before);

    await dock(page).getByRole('button', { name: 'Use this fit' }).click();
    const current = dock(page).getByRole('status', { name: 'Current fit' });
    await expect(current).toContainText(/Exponential y = 38\.0\d·e\^\(-0\.0120\d·x\)/);
    await expect(current).toContainText('recommended');
    await expect.poll(() => overlayPixels(page)).toBeGreaterThan(previewed);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(current).toHaveCount(0);
  });

  test('fits a chosen model and fills the residual column', async ({ page }) => {
    await dock(page).getByRole('tab', { name: 'Fit' }).click();
    await dock(page).getByRole('combobox', { name: 'Model' }).selectOption('poly');
    await dock(page).getByRole('textbox', { name: 'Degree' }).fill('2');
    await dock(page).getByRole('button', { name: 'Fit model' }).click();
    const list = dock(page).getByRole('radiogroup', { name: 'Fitted model' });
    await expect(list.getByRole('radio')).toHaveCount(1, { timeout: 15_000 });
    await expect(list).toContainText('Polynomial, degree 2');
    await dock(page).getByRole('button', { name: 'Use this fit' }).click();
    await dock(page).getByRole('tab', { name: 'Table' }).click();
    await expect(dock(page).getByRole('columnheader', { name: 'Residual' })).toBeVisible();
    const residuals = dock(page).locator('[aria-colindex="10"][role="gridcell"]');
    await expect(residuals.first()).toHaveText(/^-?\d/);
  });

  test('exports the kept fit as code to copy or download (task 3.3)', async ({
    page,
    context,
    browserName,
  }) => {
    await dock(page).getByRole('tab', { name: 'Fit' }).click();
    await dock(page).getByRole('button', { name: 'Recommend fits' }).click();
    await expect(
      dock(page).getByRole('radiogroup', { name: 'Recommended fits' }).getByRole('radio'),
    ).toHaveCount(3, { timeout: 15_000 });
    await dock(page).getByRole('button', { name: 'Use this fit' }).click();
    await dock(page).getByRole('button', { name: 'Code' }).click();
    const dialog = page.getByRole('dialog', { name: 'Code for Pump B' });
    await expect(dialog.getByRole('region', { name: 'Python code' })).toContainText('def pump_b(x):');
    expect((await axe(page).include('[role="dialog"]').analyze()).violations).toEqual([]);

    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Download' }).click();
    expect((await download).suggestedFilename()).toBe('pump_b.py');

    // Only Chromium lets Playwright grant clipboard reads; elsewhere, record what the app writes.
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    } else {
      await page.evaluate(() => {
        Object.defineProperty(navigator.clipboard, 'writeText', {
          configurable: true,
          value: (text: string) => {
            document.body.dataset.copied = text;
            return Promise.resolve();
          },
        });
      });
    }
    await dialog.getByRole('tab', { name: 'JavaScript' }).click();
    await dialog.getByRole('button', { name: 'Copy' }).click();
    await expect(page.getByText('Copied the JavaScript code').first()).toBeVisible();
    const code = await page.evaluate(() => document.body.dataset.copied ?? navigator.clipboard.readText());
    // The copied function computes Pump B's curve, H = 38·e^(−0.012·Q), as drawn.
    const head = await page.evaluate((source) => {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval -- running the copied code is the test
      const make = new Function(`${source}\nreturn pump_b;`) as () => (q: number) => number;
      return make()(100);
    }, code);
    expect(head).toBeCloseTo(38 * Math.exp(-1.2), 1);
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).toHaveCount(0);
  });
});
