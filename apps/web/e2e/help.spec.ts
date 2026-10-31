import { type Page } from '@playwright/test';
import { animationsSettled, graphProject, sampleImage, seedProject, expect, test, axe } from './fixtures';

// Task 1.11: the getting-started checklist, the shortcut cheat sheet, the keyboard crosshair (U2) and /docs.

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

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

const canvas = (page: Page) => page.getByRole('application', { name: /^Graph image: vector-clean/ });
const guide = (page: Page) => page.getByRole('region', { name: 'Getting started' });

async function selectedPx(page: Page): Promise<[number, number]> {
  const text = (await page.getByTestId('point-selection').textContent()) ?? '';
  const match = /x (-?[\d.]+) px, y (-?[\d.]+) px/.exec(text);
  if (!match) throw new Error(`no single selected point: "${text}"`);
  return [Number(match[1]), Number(match[2])];
}

test.describe('help', () => {
  test('the checklist starts at Crop and moves on to Calibrate for an open graph', async ({ page }) => {
    await page.goto('/');
    await expect(guide(page).getByRole('listitem').first()).toContainText('Crop, next');
    await seedProject(page, graphProject('vector-clean', { width: 2400, height: 1600 }, [DATASET]), {
      'graphs/g1/original.png': sampleImage('vector-clean'),
    });
    await expect(canvas(page)).toHaveAttribute('data-state', 'ready');
    await expect(guide(page).getByRole('listitem').nth(0)).toContainText('Crop, done');
    await expect(guide(page).getByRole('listitem').nth(1)).toContainText('Calibrate, next');
    await guide(page).getByRole('button', { name: 'Calibrate (C)' }).click();
    await expect(page.getByRole('button', { name: 'Calibrate', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const results = await axe(page).withTags(WCAG_AA).analyze();
    expect(results.violations).toEqual([]);
  });

  test('? opens the cheat sheet, which passes axe', async ({ page }) => {
    await page.goto('/');
    // The key listener is attached once the app has rendered; "load" can come first on a slow WebKit run.
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    await page.keyboard.press('?');
    const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(sheet).toBeVisible();
    // One table per group of help/shortcuts.ts.
    await expect(sheet.getByRole('table')).toHaveCount(6);
    await animationsSettled(page);
    const results = await axe(page).withTags(WCAG_AA).analyze();
    expect(results.violations).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });

  test('places points with the keyboard crosshair alone (U2)', async ({ page }) => {
    await page.goto('/');
    await seedProject(page, graphProject('vector-clean', { width: 2400, height: 1600 }, [DATASET]), {
      'graphs/g1/original.png': sampleImage('vector-clean'),
    });
    await expect(canvas(page)).toHaveAttribute('data-state', 'ready');
    await canvas(page).focus();
    await page.keyboard.press('s'); // snap off, so each point lands exactly under the crosshair
    await page.keyboard.press('p');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('keyboard-crosshair')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /Pump A/ })).toContainText('1');
    const [x0, y0] = await selectedPx(page);

    // 50 px right: far enough from the first point that the click adds a point rather than picking that one.
    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /Pump A/ })).toContainText('2');
    const [x1, y1] = await selectedPx(page);
    expect(x1 - x0).toBeCloseTo(50, 1);
    expect(y1 - y0).toBeCloseTo(1, 1);

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('keyboard-crosshair')).toBeHidden();
  });

  test('serves the docs pages, linked from the header', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('banner').getByRole('link', { name: 'Docs' }).click();
    await expect(page).toHaveURL(/\/docs$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Getting started' })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Documentation' });
    await expect(nav.getByRole('link')).toHaveCount(12);

    await nav.getByRole('link', { name: 'Keyboard shortcuts' }).click();
    await expect(page).toHaveURL(/\/docs\/keyboard-shortcuts$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Keyboard shortcuts' })).toBeVisible();
    await expect(page).toHaveTitle('Keyboard shortcuts · Curve Digitizer docs');
    const results = await axe(page).withTags(WCAG_AA).analyze();
    expect(results.violations).toEqual([]);

    await page.getByRole('link', { name: 'Back to the app' }).click();
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  });
});
