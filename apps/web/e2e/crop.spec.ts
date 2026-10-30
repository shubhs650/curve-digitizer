import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { animationsSettled } from './fixtures';

// Task 1.8: crop a PDF page into a graph at a chosen DPI, capped by the pixel budget (R7) within the render time
// target (P3), and re-render it at a higher DPI with its points rescaled.

const FIXTURES = new URL('../../../packages/pdf/fixtures/', import.meta.url);
const pdf = (name: string) => new URL(name, FIXTURES).pathname;

/** PDFium's render time of the last crop, recorded by the workspace (P3). */
const P3_RENDER_MS = 1500;

const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Project and pages' });
const cropPanel = (page: Page) => page.getByRole('region', { name: 'Crop' });
const pageView = (page: Page) => page.getByTestId('pdf-page');

async function openPage(page: Page, file: string, pageNumber: number) {
  await page.goto('/');
  await page.getByTestId('open-file-input').first().setInputFiles(pdf(file));
  await sidebar(page)
    .getByRole('list', { name: `Pages of ${file}` })
    .getByRole('button', { name: `Page ${String(pageNumber)} of ${file}` })
    .click();
  await expect(pageView(page)).toHaveAttribute('data-ready', 'true');
}

/** Drags on the page view between two points given as fractions of its size. */
async function dragOnPage(page: Page, from: readonly [number, number], to: readonly [number, number]) {
  const box = await pageView(page).boundingBox();
  if (!box) throw new Error('page view not laid out');
  await page.mouse.move(box.x + from[0] * box.width, box.y + from[1] * box.height);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0] * box.width, box.y + to[1] * box.height, { steps: 5 });
  await page.mouse.up();
}

async function lastRenderMs(page: Page): Promise<number> {
  return page.evaluate(() => {
    const entries = performance.getEntriesByName('pdf-crop-render');
    return entries[entries.length - 1]?.duration ?? Infinity;
  });
}

const graphCanvas = (page: Page) => page.getByRole('application', { name: /^Graph image:/ });

/** PNG-encoding, storing and decoding a crop near the 50 Mpx budget takes seconds after the render itself. */
const LARGE_CROP_READY = { timeout: 30_000 };

test.describe('PDF crop', () => {
  test('drags a rectangle and crops it at 600 DPI within the render target (P3)', async ({ page }) => {
    await openPage(page, 'chart.pdf', 1);
    await dragOnPage(page, [0.1, 0.1], [0.9, 0.9]);
    await expect(page.getByTestId('crop-rect')).toBeVisible();
    await cropPanel(page).getByLabel('Resolution').selectOption('600');
    const size = (await cropPanel(page).getByTestId('crop-size').textContent()) ?? '';
    await cropPanel(page).getByRole('button', { name: 'Crop to new graph' }).click();

    await expect(graphCanvas(page)).toHaveAttribute('data-state', 'ready', LARGE_CROP_READY);
    await expect(sidebar(page).getByRole('button', { name: 'chart p1' })).toBeVisible();
    // The graph is exactly the size the panel announced.
    const [, width, height] = /^(\d+) × (\d+) px at 600 DPI$/.exec(size) ?? [];
    await expect(graphCanvas(page)).toHaveAccessibleName(
      `Graph image: chart p1, ${width ?? ''} × ${height ?? ''} px`,
    );
    const renderMs = await lastRenderMs(page);
    test
      .info()
      .annotations.push({ type: 'P3', description: `${size} rendered in ${renderMs.toFixed(0)} ms` });
    expect(renderMs).toBeLessThanOrEqual(P3_RENDER_MS);
  });

  test('caps the DPI of an A1 sheet to the pixel budget and says so (R7)', async ({ page }) => {
    await openPage(page, 'chart-a1.pdf', 1);
    await cropPanel(page).getByRole('button', { name: 'Whole page' }).click();
    await cropPanel(page).getByLabel('Resolution').selectOption('600');
    await expect(cropPanel(page).getByText(/so this crop will be rendered at 254 DPI/)).toBeVisible();
    const start = Date.now();
    await cropPanel(page).getByRole('button', { name: 'Crop to new graph' }).click();
    await expect(graphCanvas(page)).toHaveAttribute('data-state', 'ready', LARGE_CROP_READY);
    test.info().annotations.push({
      type: 'R7',
      description: `crop ready in ${String(Date.now() - start)} ms, render ${(await lastRenderMs(page)).toFixed(0)} ms`,
    });
    await expect(page.getByTestId('graph-source')).toHaveText(
      'Page 1 of chart-a1.pdf, 254 DPI, 8410 × 5941 px',
    );
    expect(await lastRenderMs(page)).toBeLessThanOrEqual(P3_RENDER_MS);
  });

  test('re-renders at a higher DPI and moves points with the image', async ({ page }) => {
    await openPage(page, 'chart.pdf', 1);
    await dragOnPage(page, [0.2, 0.2], [0.6, 0.7]);
    await cropPanel(page).getByLabel('Resolution').selectOption('150');
    await cropPanel(page).getByRole('button', { name: 'Crop to new graph' }).click();
    await expect(graphCanvas(page)).toHaveAttribute('data-state', 'ready');

    // Snap off, so the point lands exactly where clicked.
    await page.keyboard.press('s');
    await page.keyboard.press('p');
    const box = await graphCanvas(page).boundingBox();
    if (!box) throw new Error('canvas not laid out');
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    const selection = page.getByTestId('point-selection');
    const px = async () => {
      const match = /x (-?[\d.]+) px, y (-?[\d.]+) px/.exec((await selection.textContent()) ?? '');
      return [Number(match?.[1]), Number(match?.[2])];
    };
    await expect(selection).toContainText('Selected');
    const [x150, y150] = await px();

    const source = page.getByRole('region', { name: 'Source' });
    await source.getByLabel('Re-render at').selectOption('300');
    await source.getByRole('button', { name: 'Re-render at higher DPI' }).click();
    await expect(page.getByTestId('graph-source')).toContainText('300 DPI');
    await expect(graphCanvas(page)).toHaveAttribute('data-state', 'ready');
    const [x300, y300] = await px();
    expect(x300).toBeCloseTo(2 * (x150 ?? NaN), 1);
    expect(y300).toBeCloseTo(2 * (y150 ?? NaN), 1);

    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('graph-source')).toContainText('150 DPI');
    expect(await px()).toEqual([x150, y150]);
  });

  test('passes axe in the crop view', async ({ page }) => {
    await openPage(page, 'chart.pdf', 2);
    await dragOnPage(page, [0.1, 0.1], [0.5, 0.5]);
    await animationsSettled(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
