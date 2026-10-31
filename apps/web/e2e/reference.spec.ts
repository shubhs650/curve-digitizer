import { type Page } from '@playwright/test';
import { axe, expect, graphProject, pageXY, sampleImage, seedProject, test } from './fixtures';

// Task 3.6: a reference image over the graph: loaded from a file or cropped from a PDF page, at a chosen
// opacity and offset, and not saved with the project.

const canvas = (page: Page) => page.getByRole('application', { name: /^Graph image: vector-clean/ });
const panel = (page: Page) => page.getByRole('region', { name: 'Reference overlay' });

/** RGB of the image layer at an image px, in device pixels. */
async function rgbAt(page: Page, px: readonly [number, number]): Promise<number[]> {
  const [x, y] = await pageXY(page, px);
  return page.evaluate(
    ([cx, cy]) => {
      const layer = document.querySelector<HTMLCanvasElement>('canvas[aria-hidden="true"]');
      const ctx = layer?.getContext('2d');
      if (!layer || !ctx) throw new Error('no image layer');
      const rect = layer.getBoundingClientRect();
      const ratio = layer.width / rect.width;
      return [
        ...ctx
          .getImageData(Math.round((cx - rect.left) * ratio), Math.round((cy - rect.top) * ratio), 1, 1)
          .data.slice(0, 3),
      ];
    },
    [x, y] as const,
  );
}

/** A solid red PNG, made by the browser. */
async function redPng(page: Page, width: number, height: number): Promise<Buffer> {
  const base64 = await page.evaluate(
    ([w, h]) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('no 2D context');
      ctx.fillStyle = '#ff0000';
      ctx.fillRect(0, 0, w, h);
      return c.toDataURL('image/png').split(',')[1] ?? '';
    },
    [width, height] as const,
  );
  return Buffer.from(base64, 'base64');
}

const near = (actual: number[], expected: number[], tolerance: number) => {
  actual.forEach((v, i) => {
    expect(Math.abs(v - (expected[i] ?? 0))).toBeLessThanOrEqual(tolerance);
  });
};

test.describe('Reference overlay', () => {
  test('lays an image over the graph, fades it and moves it', async ({ page }) => {
    await page.goto('/');
    await seedProject(page, graphProject('vector-clean', { width: 2400, height: 1600 }, []), {
      'graphs/g1/original.png': sampleImage('vector-clean'),
    });
    await expect(canvas(page)).toHaveAttribute('data-state', 'ready');
    const inside: [number, number] = [300, 250];
    const base = await rgbAt(page, inside);

    await page
      .getByTestId('reference-file-input')
      .setInputFiles({ name: 'red.png', mimeType: 'image/png', buffer: await redPng(page, 600, 500) });
    await expect(panel(page).getByText('red.png, 600 × 500 px')).toBeVisible();
    // Half see-through: halfway between the graph and red.
    await expect.poll(() => rgbAt(page, inside)).not.toEqual(base);
    near(await rgbAt(page, inside), [(base[0] ?? 0) / 2 + 127.5, (base[1] ?? 0) / 2, (base[2] ?? 0) / 2], 3);
    expect((await axe(page).analyze()).violations).toEqual([]);

    await panel(page).getByRole('slider').fill('100');
    await expect(panel(page).getByText('Opacity 100 %')).toBeVisible();
    await expect.poll(() => rgbAt(page, inside)).toEqual([255, 0, 0]);

    // Moved right past the point, the graph shows through again.
    const offsetX = panel(page).getByRole('spinbutton', { name: 'Offset X (px)' });
    await offsetX.fill('400');
    await offsetX.press('Enter');
    await expect.poll(() => rgbAt(page, inside)).toEqual(base);
    expect(await rgbAt(page, [inside[0] + 400, inside[1]])).toEqual([255, 0, 0]);

    await panel(page).getByRole('switch', { name: 'Show reference' }).uncheck();
    await expect.poll(() => rgbAt(page, [inside[0] + 400, inside[1]])).not.toEqual([255, 0, 0]);

    // A viewing aid only: gone after a reload, and the project is unchanged.
    await page.reload();
    await expect(canvas(page)).toHaveAttribute('data-state', 'ready');
    await expect(panel(page).getByRole('button', { name: 'Load reference image…' })).toBeVisible();
  });

  test('uses a crop of a PDF page as the reference of the graph', async ({ page }) => {
    await page.goto('/');
    const pdf = new URL('../../../packages/pdf/fixtures/chart.pdf', import.meta.url).pathname;
    await page.getByTestId('open-file-input').first().setInputFiles(pdf);
    const sidebar = page.getByRole('complementary', { name: 'Project and pages' });
    const pageButton = sidebar
      .getByRole('list', { name: 'Pages of chart.pdf' })
      .getByRole('button', { name: 'Page 1 of chart.pdf' });
    const crop = page.getByRole('region', { name: 'Crop' });
    await pageButton.click();
    await crop.getByRole('button', { name: 'Whole page' }).click();
    await crop.getByRole('button', { name: 'Crop to new graph' }).click();
    await expect(page.getByRole('application', { name: /^Graph image: chart p1/ })).toHaveAttribute(
      'data-state',
      'ready',
    );

    await pageButton.click();
    await crop.getByRole('button', { name: 'Whole page' }).click();
    await crop.getByLabel('Resolution').selectOption('150');
    await crop.getByRole('button', { name: 'Use as reference for chart p1' }).click();
    await expect(panel(page).getByText(/^chart\.pdf p1, \d+ × \d+ px$/)).toBeVisible();
  });
});
