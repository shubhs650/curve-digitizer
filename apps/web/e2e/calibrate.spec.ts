import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { graphProject, pageXY, sampleImage, seedProject } from './fixtures';

// Task 1.3: calibrate vector-clean by clicking its ticks, as a user would. A1's accuracy is checked on the exact
// clicks by test:samples; here clicks land on whole screen pixels of the fitted view.

/** vector-clean's tick clicks (samples/vector-clean/ops.json): X = 10, 90 on y = 0; Y = 10, 50 on x = 0. */
const CLICKS = [
  [412, 1450],
  [2108, 1450],
  [200, 1226.7],
  [200, 333.3],
] as const;

const canvas = (page: Page) => page.getByRole('application', { name: /^Graph image: vector-clean/ });
const panel = (page: Page) => page.getByRole('region', { name: 'Calibration' });

async function clickImage(page: Page, px: readonly [number, number]): Promise<void> {
  const [x, y] = await pageXY(page, px);
  await page.mouse.click(x, y);
}

async function calibrate(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Calibrate', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: 'Place X1' })).toHaveAttribute('aria-pressed', 'true');
  for (const px of CLICKS) await clickImage(page, px);
  for (const [name, value] of [
    ['X1', '10'],
    ['X2', '90'],
    ['Y1', '10'],
    ['Y2', '50'],
  ] as const) {
    await panel(page)
      .getByRole('textbox', { name: `${name} value` })
      .fill(value);
  }
}

test.describe('calibration', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await seedProject(page, graphProject('vector-clean', { width: 2400, height: 1600 }), {
      'graphs/g1/original.png': sampleImage('vector-clean'),
    });
    await expect(canvas(page)).toHaveAttribute('data-state', 'ready');
  });

  test('calibrates from four clicks and reads calibrated values under the cursor', async ({ page }) => {
    await calibrate(page);
    await expect(panel(page).getByTestId('calibration-status')).toHaveText('Calibrated');
    // Blank crossings are solved from the clicks, so four clicks fit exactly.
    await expect(panel(page).getByTestId('calibration-summary')).toContainText('Residual 0.000 px');

    // (1260, 780) is X = 50, Y = 30 on vector-clean.
    const [x, y] = await pageXY(page, [1260, 780]);
    await page.mouse.move(x, y);
    const text = (await page.getByTestId('cursor-readout').textContent()) ?? '';
    const match = /X = (-?[\d.]+) · Y = (-?[\d.]+)/.exec(text);
    expect(match, text).not.toBeNull();
    // A screen pixel of the fitted view is about 2.5 image px, about 0.12 units on either axis.
    expect(Math.abs(Number(match?.[1]) - 50)).toBeLessThan(0.5);
    expect(Math.abs(Number(match?.[2]) - 30)).toBeLessThan(0.5);
  });

  test('drags a marker to fine-tune it, one undo step per drag', async ({ page }) => {
    await calibrate(page);
    const hint = panel(page)
      .getByText(/^at [\d.]+, [\d.]+ px$/)
      .nth(1);
    const before = await hint.textContent();
    const [x, y] = await pageXY(page, CLICKS[1]);
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 10, y + 4, { steps: 5 });
    await page.mouse.up();
    await expect(hint).not.toHaveText(before ?? '');
    await canvas(page).focus();
    await page.keyboard.press('Control+z');
    await expect(hint).toHaveText(before ?? '');
  });

  test('passes axe with the calibration filled in', async ({ page }) => {
    await calibrate(page);
    await expect(panel(page).getByTestId('calibration-status')).toHaveText('Calibrated');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
