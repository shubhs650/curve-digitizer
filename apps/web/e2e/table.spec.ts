import { type Page } from '@playwright/test';
import {
  canvasView,
  graphProject,
  pageXY,
  sampleImage,
  seedProject,
  expect,
  test,
  axe,
  withDockOpen,
} from './fixtures';

// Task 1.6: the data dock's live table follows the canvas, edits points in place and copies to the clipboard.

const point = (id: string, px: readonly [number, number]) => ({
  id,
  px,
  value: [0, 0],
  sigma: [0, 0],
  excludedFromFit: false,
  outOfRange: false,
  origin: 'manual',
});

const DATASET = {
  id: 'd1',
  name: 'Pump A',
  color: '#0072b2',
  mode: 'function',
  xUnit: '',
  yUnit: '',
  sourceRef: '',
  notes: '',
  points: [point('p1', [600, 900]), point('p2', [1200, 700])],
};

const canvas = (page: Page) => page.getByRole('application', { name: /^Graph image: vector-clean/ });
const grid = (page: Page) => page.getByRole('grid', { name: 'Points of Pump A' });
const cell = (page: Page, row: number, col: number) =>
  grid(page).locator(`[data-cell="${String(row)}:${String(col)}"]`);

test.describe('data table', () => {
  test.beforeEach(async ({ page }) => {
    await withDockOpen(page);
    await page.goto('/');
    await seedProject(page, graphProject('vector-clean', { width: 2400, height: 1600 }, [DATASET]), {
      'graphs/g1/original.png': sampleImage('vector-clean'),
    });
    await expect(canvas(page)).toHaveAttribute('data-state', 'ready');
  });

  test('shows points live as they are added on the canvas, and follows the selection', async ({ page }) => {
    await expect(grid(page).getByRole('row')).toHaveCount(3);
    await page.keyboard.press('s');
    await page.keyboard.press('p');
    const [x, y] = await pageXY(page, [1800, 500]);
    await page.mouse.click(x, y);
    await expect(grid(page).getByRole('row')).toHaveCount(4);
    await expect(grid(page).getByRole('row').nth(3)).toHaveAttribute('aria-selected', 'true');
    await expect(cell(page, 2, 5)).toHaveText(/^\d+\.\d\d$/);
    // Within one screen pixel of the click: Firefox delivers mouse events on whole CSS pixels.
    const { view } = await canvasView(page);
    expect(Math.abs(Number(await cell(page, 2, 5).textContent()) - 1800)).toBeLessThanOrEqual(1 / view.scale);

    await cell(page, 0, 0).click();
    await expect(page.getByTestId('point-selection')).toContainText('x 600.00 px, y 900.00 px');
  });

  test('edits a cell in place; the point moves and undo puts it back', async ({ page }) => {
    await cell(page, 1, 6).dblclick();
    const editor = page.getByLabel('y px of point 2');
    await editor.fill('750.5');
    await editor.press('Enter');
    await expect(cell(page, 1, 6)).toHaveText('750.50');
    await expect(page.getByTestId('point-selection')).toContainText('y 750.50 px');
    await page.keyboard.press('Control+z');
    await expect(cell(page, 1, 6)).toHaveText('700.00');
  });

  test('copies the table to the clipboard as tab-separated text', async ({ page, context, browserName }) => {
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
    await page.getByRole('button', { name: 'Copy table' }).click();
    await expect(page.getByText('Copied 2 rows').first()).toBeVisible();
    const text = await page.evaluate(() => document.body.dataset.copied ?? navigator.clipboard.readText());
    expect(text.split('\r\n')).toEqual([
      'X\tY\tσx\tσy\tx px\ty px\tOrigin\tExcluded',
      '\t\t\t\t600\t900\tmanual\tFALSE',
      '\t\t\t\t1200\t700\tmanual\tFALSE',
      '',
    ]);
  });

  test('passes axe with the table showing', async ({ page }) => {
    await cell(page, 0, 0).click();
    expect((await axe(page).analyze()).violations).toEqual([]);
  });
});
