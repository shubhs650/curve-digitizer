import { readFileSync } from 'node:fs';
import { type Page } from '@playwright/test';
import { axe, expect, pageXY, SAMPLES, test } from './fixtures';

// Task 3.8: the bundled samples open from the home screen in one click as calibrated demo projects (PRD §4.12),
// loaded from the app's own origin, and are ready to trace.

type Vec2 = readonly [number, number];

const ops = JSON.parse(readFileSync(new URL('vector-clean/ops.json', SAMPLES), 'utf8')) as {
  ops: { id: string; start?: Vec2; end?: Vec2 }[];
};
const op = ops.ops.find((o) => o.id === 'trace-d1');

async function clickImage(page: Page, px: Vec2): Promise<void> {
  const [x, y] = await pageXY(page, px);
  await page.mouse.click(x, y);
}

test('opens the pump curves sample calibrated, ready to trace, from its own origin', async ({
  page,
  baseURL,
}) => {
  const self = new URL(baseURL ?? '').origin;
  const offSite: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== self) offSite.push(request.url());
  });
  await page.goto('/');
  const samples = page.getByRole('list', { name: 'Samples' });
  await expect(samples.getByRole('listitem')).toHaveCount(4);
  expect((await axe(page).analyze()).violations).toEqual([]);

  await samples.getByRole('button', { name: 'Open the Pump curves sample' }).click();
  await expect(
    page.getByRole('application', { name: /^Graph image: Pump curves, 2400 × 1600 px/ }),
  ).toHaveAttribute('data-state', 'ready');
  await expect(
    page.getByRole('region', { name: 'Calibration' }).getByTestId('calibration-status'),
  ).toHaveText('Calibrated');
  for (const name of ['Pump A', 'Pump B', 'Pump C']) {
    await expect(page.getByRole('button', { name: new RegExp(`^${name}`) })).toBeVisible();
  }

  await page.keyboard.press('t');
  await clickImage(page, op?.start ?? [0, 0]);
  const panel = page.getByRole('region', { name: 'Guided trace' });
  await expect(panel.getByRole('button', { name: 'Trace to the curve ends' })).toBeVisible();
  await clickImage(page, op?.end ?? [0, 0]);
  await expect(panel.getByText(/^Traced\./)).toBeVisible({ timeout: 15_000 });
  const add = panel.getByRole('button', { name: /^Add \d+ points to Pump A$/ });
  const count = Number(/Add (\d+)/.exec((await add.textContent()) ?? '')?.[1]);
  expect(count).toBeGreaterThan(300);
  await add.click();
  await expect(page.getByRole('button', { name: /^Pump A/ })).toContainText(String(count));
  expect(offSite).toEqual([]);
});

test('opens every other sample calibrated', async ({ page }) => {
  for (const [title, size] of [
    ['Allowable stress (1970s scan)', '1700 × 1200'],
    ['S-N curve family', '2000 × 1500'],
    ['Dark background', '1800 × 1200'],
  ] as const) {
    await page.goto('/');
    await page.getByRole('button', { name: `Open the ${title} sample` }).click();
    await expect(
      page.getByRole('application', { name: `Graph image: ${title}, ${size} px` }),
    ).toHaveAttribute('data-state', 'ready');
    await expect(
      page.getByRole('region', { name: 'Calibration' }).getByTestId('calibration-status'),
    ).toHaveText('Calibrated');
    await page.getByRole('button', { name: 'All projects' }).click();
  }
});
