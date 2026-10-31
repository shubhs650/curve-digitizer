import type { Page } from '@playwright/test';
import { axe, expect, graphProject, pageXY, sampleImage, seedProject, test } from './fixtures';

// Task 2.2: the pre-processing panel on the dark-background sample: the Invert suggestion, the live processed
// preview from the compute worker, the preset and undo.

const canvas = (page: Page) => page.getByRole('application', { name: /^Graph image: dark-bg/ });
const panel = (page: Page) => page.getByRole('region', { name: 'Pre-processing' });

/** Luma of the image layer at an image px (the layer under the overlay, in device pixels). */
async function lumaAt(page: Page, px: readonly [number, number]): Promise<number> {
  const [x, y] = await pageXY(page, px);
  return page.evaluate(
    ([cx, cy]) => {
      const layer = document.querySelector<HTMLCanvasElement>('canvas[aria-hidden="true"]');
      const ctx = layer?.getContext('2d');
      if (!layer || !ctx) throw new Error('no image layer');
      const rect = layer.getBoundingClientRect();
      const ratio = layer.width / rect.width;
      const [r, g, b] = ctx.getImageData(
        Math.round((cx - rect.left) * ratio),
        Math.round((cy - rect.top) * ratio),
        1,
        1,
      ).data;
      return 0.299 * (r ?? 0) + 0.587 * (g ?? 0) + 0.114 * (b ?? 0);
    },
    [x, y] as const,
  );
}

test.describe('pre-processing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await seedProject(page, graphProject('dark-bg', { width: 1800, height: 1200 }, []), {
      'graphs/g1/original.png': sampleImage('dark-bg'),
    });
    await expect(canvas(page)).toHaveAttribute('data-state', 'ready');
  });

  test('suggests Invert on a dark chart and previews the processed image', async ({ page }) => {
    // Plain background: no curve or grid line within 6 px, so where each browser's read-back lands to the
    // sub-pixel does not matter ([900, 700] was on a yellow curve, which WebKit hit).
    const paper: [number, number] = [1000, 720];
    expect(await lumaAt(page, paper)).toBeLessThan(60);
    const hint = panel(page).getByTestId('dark-background-hint');
    await expect(hint).toBeVisible();
    await hint.getByRole('button', { name: 'Add Invert' }).click();
    await expect(hint).toHaveCount(0);
    await expect(panel(page).getByRole('listitem', { name: '1. Invert' })).toBeVisible();

    await panel(page).getByRole('switch', { name: 'Show processed image' }).check();
    await expect.poll(() => lumaAt(page, paper), { timeout: 15_000 }).toBeGreaterThan(195);
    expect((await axe(page).analyze()).violations).toEqual([]);

    // Before/after: switching the preview off shows the original again.
    await panel(page).getByRole('switch', { name: 'Show processed image' }).uncheck();
    await expect.poll(() => lumaAt(page, paper)).toBeLessThan(60);

    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(panel(page).getByText('No filters: the tracers read the original image.')).toBeVisible();
    await expect(panel(page).getByTestId('dark-background-hint')).toBeVisible();
  });

  test('applies the Enhance for tracing preset', async ({ page }) => {
    await panel(page).getByRole('button', { name: 'Enhance for tracing' }).click();
    await expect(panel(page).getByRole('listitem')).toHaveCount(4);
    await expect(panel(page).getByRole('switch', { name: 'Show processed image' })).toBeChecked();
    await expect(panel(page).getByRole('listitem', { name: '3. Suppress grid lines' })).toBeVisible();
    await expect(panel(page).getByRole('spinbutton', { name: 'Minimum run (px)' })).toHaveValue('600');
  });
});
