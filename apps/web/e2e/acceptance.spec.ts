import { readFileSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';

// Task 1.12: the M1 targets that need the whole app rather than one feature: P1 (cold load) and R1 (the full
// workflow offline). The others are covered by the feature specs (see docs/ACCEPTANCE_TARGETS.md).

const FIXTURES = new URL('../../../packages/pdf/fixtures/', import.meta.url);
const CHART_PDF = new URL('chart.pdf', FIXTURES).pathname;

/** P1: "≤ 2 s to interactive on mid laptop" for image-only use. */
const P1_INTERACTIVE_MS = 2000;

const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Project and pages' });
const graphCanvas = (page: Page) => page.getByRole('application', { name: /^Graph image:/ });
const calibration = (page: Page) => page.getByRole('region', { name: 'Calibration' });
const pageButton = (page: Page) =>
  sidebar(page)
    .getByRole('list', { name: 'Pages of chart.pdf' })
    .getByRole('button', { name: 'Page 1 of chart.pdf' });

/** Clicks the graph canvas at a fraction of its size. */
async function clickCanvas(page: Page, fx: number, fy: number): Promise<void> {
  const box = await graphCanvas(page).boundingBox();
  if (!box) throw new Error('canvas not laid out');
  await page.mouse.click(box.x + fx * box.width, box.y + fy * box.height);
}

test.describe('M1 acceptance', () => {
  test('P1: a cold load is interactive within 2 s', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Open PDF or image…' })).toBeEnabled();
    // Time since navigation started, read after the first control is usable; includes the assertion's polling.
    const ms = await page.evaluate(() => performance.now());
    test.info().annotations.push({ type: 'P1 interactive', description: `${ms.toFixed(0)} ms` });
    expect(ms).toBeLessThan(P1_INTERACTIVE_MS);
  });

  test('R1: after one PDF open, the whole workflow runs offline', async ({ page, context }) => {
    test.setTimeout(60_000);
    await page.goto('/');
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.getByTestId('open-file-input').first().setInputFiles(CHART_PDF);
    await expect(pageButton(page)).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    // The open project comes back from this device's storage, and PDFium from the service worker's cache.
    await pageButton(page).click();
    await expect(page.getByTestId('pdf-page')).toHaveAttribute('data-ready', 'true');
    const crop = page.getByRole('region', { name: 'Crop' });
    await crop.getByRole('button', { name: 'Whole page' }).click();
    await crop.getByLabel('Resolution').selectOption('150');
    await crop.getByRole('button', { name: 'Crop to new graph' }).click();
    await expect(graphCanvas(page)).toHaveAttribute('data-state', 'ready');

    await page.getByRole('button', { name: 'Calibrate', exact: true }).click();
    await clickCanvas(page, 0.2, 0.8);
    await clickCanvas(page, 0.8, 0.8);
    await clickCanvas(page, 0.2, 0.75);
    await clickCanvas(page, 0.2, 0.2);
    for (const [name, value] of [
      ['X1', '0'],
      ['X2', '10'],
      ['Y1', '0'],
      ['Y2', '5'],
    ] as const) {
      await calibration(page)
        .getByRole('textbox', { name: `${name} value` })
        .fill(value);
    }
    await expect(calibration(page).getByTestId('calibration-status')).toHaveText('Calibrated');

    await page.keyboard.press('s'); // snap off: the blank areas clicked here have no curve to snap to
    await page.getByRole('button', { name: 'Add points', exact: true }).click();
    await clickCanvas(page, 0.4, 0.5);
    await clickCanvas(page, 0.6, 0.4);

    await page.getByRole('button', { name: 'Export' }).click();
    const [file] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: /CSV, long/ }).click(),
    ]);
    const rows = readFileSync(await file.path(), 'utf8')
      .split(/\r\n/)
      .map((line) => line.replace(/^\uFEFF/, ''))
      .filter((line) => line !== '' && !line.startsWith('#'));
    // Header plus the two points.
    expect(rows).toHaveLength(3);
  });
});
