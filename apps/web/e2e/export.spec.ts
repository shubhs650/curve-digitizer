import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { type Page } from '@playwright/test';
import { graphProject, sampleImage, SAMPLES, seedProject, expect, test } from './fixtures';

// Task 1.9: CSV (long, wide), Excel workbook and audit JSON downloads, built in a worker.

const truth = JSON.parse(readFileSync(new URL('vector-clean/ground-truth.json', SAMPLES), 'utf8')) as {
  pxToAxis: number[];
  datasets: { samples: { value: [number, number]; px: [number, number] }[] }[];
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
  return { name: file.suggestedFilename(), bytes: readFileSync(path) };
}

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
