import { readFileSync } from 'node:fs';
import { type Page } from '@playwright/test';
import { axe, expect, graphProject, sampleImage, SAMPLES, seedProject, test } from './fixtures';

// Task 3.5: the interpolation calculator and compare readout on vector-clean's Pump A
// (H = 52 + 0.05 Q − 0.0035 Q² − 0.000012 Q³) and Pump B (H = 38·e^(−0.012 Q)), from their ground-truth points.

type Vec2 = readonly [number, number];

const truth = JSON.parse(readFileSync(new URL('vector-clean/ground-truth.json', SAMPLES), 'utf8')) as {
  pxToAxis: number[];
  datasets: { id: string; name: string; color: string; samples: { value: Vec2; px: Vec2 }[] }[];
};

const datasets = truth.datasets.slice(0, 2).map((d) => ({
  id: d.id,
  name: d.name,
  color: d.color,
  mode: 'function',
  xUnit: 'm³/h',
  yUnit: 'm',
  sourceRef: '',
  notes: '',
  points: d.samples.map((s, i) => ({
    id: `${d.id}p${String(i)}`,
    px: s.px,
    value: s.value,
    sigma: [0.03, 0.03],
    excludedFromFit: false,
    outOfRange: false,
    origin: 'manual',
  })),
}));

const project = graphProject('vector-clean', { width: 2400, height: 1600 }, datasets);
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

const pumpA = (q: number) => 52 + 0.05 * q - 0.0035 * q ** 2 - 0.000012 * q ** 3;
const pumpB = (q: number) => 38 * Math.exp(-0.012 * q);

const canvas = (page: Page) => page.getByRole('application', { name: /^Graph image: vector-clean/ });
const dock = (page: Page) => page.getByRole('region', { name: 'Data dock' });

/** The calculator table's cells, row by row. */
async function rows(page: Page): Promise<string[][]> {
  return dock(page)
    .getByRole('table', { name: 'Calculated values' })
    .evaluate((table) =>
      [...table.querySelectorAll('tr')].map((tr) =>
        [...tr.querySelectorAll('th, td')].map((c) => c.textContent),
      ),
    );
}

test.describe('Calculator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await seedProject(page, calibrated, { 'graphs/g1/original.png': sampleImage('vector-clean') });
    await expect(canvas(page)).toHaveAttribute('data-state', 'ready');
  });

  test('reads both pumps at typed flows, compares them and copies the table', async ({
    page,
    context,
    browserName,
  }) => {
    await dock(page).getByRole('tab', { name: 'Calculator' }).click();
    await dock(page).getByRole('textbox', { name: 'X values (m³/h)' }).fill('50, 80 100');
    await expect(dock(page).getByRole('table', { name: 'Calculated values' })).toBeVisible();
    const [header, at50, at80, at100] = await rows(page);
    expect(header).toEqual(['X (m³/h)', 'Pump A (m) · points', 'Pump B (m) · points']);
    // Read between digitised points: within a few cm of head of the true curves.
    expect(Number(at50?.[1])).toBeCloseTo(pumpA(50), 1);
    expect(Number(at50?.[2])).toBeCloseTo(pumpB(50), 1);
    expect(Number(at80?.[1])).toBeCloseTo(pumpA(80), 1);
    // 100 m³/h is past the last point (96), so there is no value without a fit.
    expect(at100).toEqual(['100', '—', '—']);

    await dock(page).getByRole('checkbox', { name: 'Compare' }).check();
    const compared = await rows(page);
    expect(compared[0]?.slice(3)).toEqual(['Pump A − Pump B', 'Pump A / Pump B']);
    expect(Number(compared[1]?.[3])).toBeCloseTo(pumpA(50) - pumpB(50), 1);
    expect(Number(compared[1]?.[4])).toBeCloseTo(pumpA(50) / pumpB(50), 2);
    expect((await axe(page).analyze()).violations).toEqual([]);

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
    await dock(page).getByRole('button', { name: 'Copy results' }).click();
    await expect(page.getByText('Copied 3 rows').first()).toBeVisible();
    const text = await page.evaluate(() => document.body.dataset.copied ?? navigator.clipboard.readText());
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('X (m³/h)\tPump A (m)\tPump B (m)\tPump A − Pump B\tPump A / Pump B');
    expect(lines[3]).toBe('100\t\t\t\t');
  });

  test('answers from a kept fit, flagging extrapolation', async ({ page }) => {
    await dock(page).getByRole('tab', { name: 'Fit' }).click();
    await dock(page).getByRole('button', { name: 'Recommend fits' }).click();
    await expect(
      dock(page).getByRole('radiogroup', { name: 'Recommended fits' }).getByRole('radio'),
    ).toHaveCount(3, { timeout: 15_000 });
    await dock(page).getByRole('button', { name: 'Use this fit' }).click();
    await dock(page).getByRole('tab', { name: 'Calculator' }).click();
    await dock(page).getByRole('textbox', { name: 'X values (m³/h)' }).fill('50 100');
    const [header, at50, at100] = await rows(page);
    expect(header?.[1]).toBe('Pump A (m) · fit');
    expect(Number(at50?.[1])).toBeCloseTo(pumpA(50), 1);
    expect(at100?.[1]).toMatch(/\*$/);
    expect(Number(at100?.[1]?.slice(0, -1))).toBeCloseTo(pumpA(100), 0);
    await expect(dock(page).getByText(/extrapolated/)).toBeVisible();
  });
});
