import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { type Page } from '@playwright/test';
import {
  downloadName,
  expect,
  graphProject,
  sampleImage,
  SAMPLES,
  seedProject,
  settled,
  test,
  UNTRACED,
} from './fixtures';

// Task 1.9: CSV (long, wide), Excel workbook and audit JSON downloads, built in a worker. Task 3.4: the workbook
// with fits, chart and image within the P6 time.

const truth = JSON.parse(readFileSync(new URL('vector-clean/ground-truth.json', SAMPLES), 'utf8')) as {
  pxToAxis: number[];
  datasets: { name: string; color: string; samples: { value: [number, number]; px: [number, number] }[] }[];
};
const samples = truth.datasets[0]?.samples.slice(0, 3) ?? [];

const project = graphProject('vector-clean', { width: 2400, height: 1600 }, [
  {
    id: 'd1',
    name: 'Pump A',
    color: '#0072b2',
    mode: 'function',
    param: { name: 'Speed', value: 1450, unit: 'rpm' },
    xUnit: 'm³/h',
    yUnit: 'm',
    sourceRef: 'Sample vector-clean',
    notes: '',
    points: samples.map((s, i) => ({
      id: `p${String(i)}`,
      px: s.px,
      value: s.value,
      sigma: [0, 0],
      excludedFromFit: false,
      outOfRange: false,
      origin: 'manual',
    })),
  },
]);
const CALIBRATION = {
  xAxis: { type: 'linear', label: 'Flow rate Q', unit: 'm³/h' },
  yAxis: { type: 'linear', label: 'Head H', unit: 'm' },
  model: 'affine',
  points: [],
  matrix: truth.pxToAxis,
  residualPx: 0,
  resolution: { xUnitsPerPx: 0.047, yUnitsPerPx: 0.045 },
  warnings: [],
};

/** P6 (docs/ACCEPTANCE_TARGETS.md): the workbook of a 4-dataset graph, with chart and image, in ≤ 2 s. */
const P6_MS = 2000;

/**
 * vector-clean's three pumps and a fourth curve 3 m below Pump A, 25 points each, every one with a kept fit: a
 * cubic for Pump A, a piecewise line through the points for the others.
 */
function fourDatasetProject() {
  const curves = [
    ...truth.datasets,
    {
      ...(truth.datasets[0] ?? { samples: [] }),
      name: 'Pump A (worn)',
      color: '#cc79a7',
      samples: (truth.datasets[0]?.samples ?? []).map((s) => ({
        value: [s.value[0], s.value[1] - 3] as [number, number],
        px: [s.px[0], s.px[1] + 3 / 0.045] as [number, number],
      })),
    },
  ];
  const datasets = curves.map((c, k) => ({
    id: `d${String(k)}`,
    name: c.name,
    color: c.color,
    mode: 'function',
    xUnit: 'm³/h',
    yUnit: 'm',
    sourceRef: '',
    notes: '',
    points: c.samples.map((s, i) => ({
      id: `d${String(k)}p${String(i)}`,
      px: s.px,
      value: s.value,
      sigma: [0.03, 0.03],
      excludedFromFit: false,
      outOfRange: false,
      origin: 'manual',
    })),
  }));
  const fits = curves.map((c, k) => {
    const xs = c.samples.map((s) => s.value[0]);
    const domain = [Math.min(...xs), Math.max(...xs)];
    const stats = { n: xs.length, r2: 0.999, rmse: 0.05, aicc: -100 };
    const base = {
      id: `f${String(k)}`,
      datasetId: `d${String(k)}`,
      space: { x: 'lin', y: 'lin' },
      domain,
      stats,
    };
    return k === 0
      ? { ...base, model: 'poly', params: { c: [52, 0.05, -0.0035, -0.000012] }, recommended: true }
      : {
          ...base,
          model: 'piecewise',
          params: { knots: xs, values: c.samples.map((s) => s.value[1]) },
          recommended: false,
        };
  });
  const p = graphProject('vector-clean', { width: 2400, height: 1600 }, datasets);
  return { ...p, graphs: p.graphs.map((g) => ({ ...g, calibration: CALIBRATION, fits })) };
}

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

async function download(page: Page, item: RegExp) {
  await page.getByRole('button', { name: 'Export' }).click();
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: item }).click(),
  ]);
  const path = await file.path();
  return { name: downloadName(file), bytes: readFileSync(path) };
}

test.use(UNTRACED);

test.describe('export', () => {
  test('CSV long and wide carry the units, source and recomputed values', async ({ page }) => {
    await page.goto('/');
    await seedProject(page, calibrated, { 'graphs/g1/original.png': sampleImage('vector-clean') });

    const long = await download(page, /CSV, long/);
    expect(long.name).toBe('E2E vector-clean - vector-clean.csv');
    const text = long.bytes.toString('utf8');
    expect(text.startsWith('﻿# Curve Digitizer')).toBe(true);
    expect(text).toContain('# X axis: Flow rate Q [m³/h] (linear)');
    expect(text).toContain('source: Sample vector-clean');
    const rows = text
      .trim()
      .split('\r\n')
      .filter((l) => !l.startsWith('#') && !l.startsWith('﻿'));
    expect(rows[0]).toBe('dataset,param,x,y,sigma_x,sigma_y,excluded_from_fit,out_of_range');
    rows.slice(1).forEach((row, i) => {
      const [name, param, x, y] = row.split(',');
      expect([name, param]).toEqual(['Pump A', '1450']);
      expect(Number(x)).toBeCloseTo(samples[i]?.value[0] ?? NaN, 4);
      expect(Number(y)).toBeCloseTo(samples[i]?.value[1] ?? NaN, 4);
    });

    const wide = await download(page, /CSV, wide/);
    expect(wide.name).toBe('E2E vector-clean - vector-clean (wide).csv');
    expect(wide.bytes.toString('utf8')).toContain('\r\nx,Pump A\r\n');
  });

  test('Excel workbook and audit JSON for the whole project', async ({ page }) => {
    await page.goto('/');
    const image = sampleImage('vector-clean');
    await seedProject(page, calibrated, { 'graphs/g1/original.png': image });

    const workbook = await download(page, /Excel workbook/);
    expect(workbook.name).toBe('E2E vector-clean.xlsx');
    expect(workbook.bytes.subarray(0, 2).toString('latin1')).toBe('PK');
    expect(workbook.bytes.includes('xl/worksheets/sheet2.xml')).toBe(true);

    const audit = await download(page, /Audit JSON/);
    expect(audit.name).toBe('E2E vector-clean.audit.json');
    const json = JSON.parse(audit.bytes.toString('utf8')) as {
      graphs: { image: { sha256: string } }[];
      audit: { appVersion: string };
    };
    expect(json.graphs[0]?.image.sha256).toBe(createHash('sha256').update(image).digest('hex'));
    expect(json.audit.appVersion).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('Excel workbook with fits, chart and image for a 4-dataset graph within P6 (and P5)', async ({
    page,
  }) => {
    await page.goto('/');
    await seedProject(page, fourDatasetProject(), { 'graphs/g1/original.png': sampleImage('vector-clean') });
    // P5 here is about the export. Opening this project is a long task of its own (issue #46), and its entry
    // can arrive after an observer registered right after the click; start observing once the page is idle.
    await expect(page.getByRole('application', { name: /^Graph image/ })).toHaveAttribute(
      'data-state',
      'ready',
    );
    await settled(page);
    await page.evaluate(() => {
      const w = window as unknown as { longTasks: number[] };
      w.longTasks = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) w.longTasks.push(entry.duration);
      }).observe({ type: 'longtask' });
    });
    await page.getByRole('button', { name: 'Export' }).click();
    const start = Date.now();
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: /Excel workbook/ }).click(),
    ]);
    const elapsed = Date.now() - start;
    const bytes = readFileSync(await file.path());
    test.info().annotations.push({ type: 'P6', description: `4-dataset workbook in ${String(elapsed)} ms` });
    expect(elapsed).toBeLessThanOrEqual(P6_MS);
    // P5: the workbook is built in the export worker, so the page never blocks.
    const longTasks = await page.evaluate(() =>
      (window as unknown as { longTasks: number[] }).longTasks.filter((d) => d > 100),
    );
    expect(longTasks).toEqual([]);
    // Zip entry names are stored as plain text: the Data, Fit, VBA and Project sheets, the chart and the image.
    for (const part of [
      'xl/worksheets/sheet4.xml',
      'xl/charts/chart1.xml',
      'xl/drawings/drawing1.xml',
      'xl/media/image1.png',
    ]) {
      expect(bytes.includes(part), part).toBe(true);
    }
    // The image is stored, not recompressed: its PNG bytes are in the file as they are.
    expect(bytes.includes(sampleImage('vector-clean').subarray(0, 4096))).toBe(true);
  });

  test('CSV and Excel wait for a calibration', async ({ page }) => {
    await page.goto('/');
    await seedProject(page, project, { 'graphs/g1/original.png': sampleImage('vector-clean') });
    await page.getByRole('button', { name: 'Export' }).click();
    for (const item of [/CSV, long/, /CSV, wide/, /Excel workbook/]) {
      await expect(page.getByRole('menuitem', { name: item })).toBeDisabled();
    }
    await expect(page.getByRole('menuitem', { name: /Audit JSON/ })).toBeEnabled();
  });
});
