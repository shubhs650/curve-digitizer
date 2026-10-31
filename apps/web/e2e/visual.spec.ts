import { type Page } from '@playwright/test';
import {
  animationsSettled,
  expect,
  graphProject,
  sampleImage,
  seedProject,
  test,
  withDockOpen,
} from './fixtures';

// v0.4.0 visual baselines (ADR 47): the home screen, the crop view and a graph at laptop and desktop sizes, in
// both themes. Layout rules live in layout.spec.ts; these catch what geometry checks cannot (spacing, colour,
// a panel that looks broken). Baselines are Chromium on Linux; update them with
// `npx playwright test apps/web/e2e/visual.spec.ts --project=chromium --update-snapshots` after an intended change.

const STYLE = new URL('visual/visual.css', import.meta.url).pathname;
const SHOT = { stylePath: STYLE, maxDiffPixelRatio: 0.01, animations: 'disabled' } as const;

/**
 * Screenshot options with scaled raster content masked: Skia's image resampling differs between CPUs, so sample
 * previews and the graph image never match pixel for pixel across machines. The chrome around them is what these
 * tests guard; the image views have their own tests.
 */
function shot(page: Page) {
  return { ...SHOT, mask: [page.locator('img[src$=".webp"]'), graphCanvas(page)] };
}

// Glyph hinting follows the machine's fontconfig, which differs between runners and sandboxes; turning it off
// in Chromium makes text rasterise the same everywhere.
test.use({
  launchOptions: { args: ['--font-render-hinting=none', '--disable-font-subpixel-positioning'] },
  // The app's CSP refuses the inline <style> that carries visual.css; without this the font override never applies.
  bypassCSP: true,
});

const FIXTURES = new URL('../../../packages/pdf/fixtures/', import.meta.url);
const CHART_PDF = new URL('chart.pdf', FIXTURES).pathname;

const DATASET = {
  id: 'd1',
  name: 'Pump A',
  color: '#0072b2',
  mode: 'function',
  xUnit: '',
  yUnit: '',
  sourceRef: '',
  notes: '',
  points: [],
};

const graphCanvas = (page: Page) => page.getByRole('application', { name: /^Graph image:/ });

async function openGraph(page: Page) {
  await page.goto('/');
  await seedProject(page, graphProject('vector-clean', { width: 2400, height: 1600 }, [DATASET]), {
    'graphs/g1/original.png': sampleImage('vector-clean'),
  });
  await expect(graphCanvas(page)).toHaveAttribute('data-state', 'ready');
  // Park the pointer off the canvas: no loupe or cursor readout in the picture.
  await page.mouse.move(0, 0);
  await animationsSettled(page);
}

test.describe('visual', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'baselines are Chromium on Linux');

  test('home screen, light and dark, at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    await animationsSettled(page);
    await expect(page).toHaveScreenshot('home-1366-light.png', shot(page));
    await page.getByRole('button', { name: 'Dark theme' }).click();
    await animationsSettled(page);
    await expect(page).toHaveScreenshot('home-1366-dark.png', shot(page));
  });

  test('home screen at 768×1024', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    await animationsSettled(page);
    await expect(page).toHaveScreenshot('home-768.png', shot(page));
  });

  test('crop view with a rectangle at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await page.getByTestId('open-file-input').first().setInputFiles(CHART_PDF);
    const thumbs = page.getByRole('list', { name: 'Pages of chart.pdf' }).getByRole('img');
    await expect(thumbs).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await thumbs.nth(i).scrollIntoViewIfNeeded();
      await expect(thumbs.nth(i)).toHaveAttribute('data-ready', 'true');
    }
    await page.getByRole('button', { name: 'Page 1 of chart.pdf' }).click();
    const pdfPage = page.getByTestId('pdf-page');
    await expect(pdfPage).toHaveAttribute('data-ready', 'true');
    const box = await pdfPage.boundingBox();
    if (!box) throw new Error('page view not laid out');
    await page.mouse.move(Math.round(box.x + box.width * 0.12), Math.round(box.y + box.height * 0.12));
    await page.mouse.down();
    await page.mouse.move(Math.round(box.x + box.width * 0.9), Math.round(box.y + box.height * 0.82), {
      steps: 4,
    });
    await page.mouse.up();
    await page.mouse.move(0, 0);
    await animationsSettled(page);
    await expect(page).toHaveScreenshot('crop-1366.png', shot(page));
  });

  test('graph at 1366×768 (dock collapsed) and 1920×1080 (dock open)', async ({ page }) => {
    await withDockOpen(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await openGraph(page);
    await expect(page).toHaveScreenshot('graph-1920.png', shot(page));

    await page.getByRole('button', { name: 'Data dock' }).click();
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.getByRole('button', { name: 'Fit to window' }).click();
    await page.mouse.move(0, 0);
    await animationsSettled(page);
    await expect(page).toHaveScreenshot('graph-1366.png', shot(page));
  });
});
