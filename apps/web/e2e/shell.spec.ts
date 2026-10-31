import { expect, test, axe } from './fixtures';

// WCAG 2.x A and AA, which covers U4 (contrast on primary surfaces) for both themes.
const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('app shell', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders the header, and the home screen at full width', async ({ page }) => {
    const header = page.getByRole('banner');
    await expect(header.getByText('Curve Digitizer')).toBeVisible();
    for (const name of ['Open Engineering Tools home', 'Docs', 'Report issue', 'GitHub repository']) {
      await expect(header.getByRole('link', { name })).toBeVisible();
    }
    await expect(page.getByRole('main', { name: 'Canvas' })).toBeVisible();
    // The tool rail, inspector and dock come with a graph (ADR 47; laid out in layout.spec.ts).
    await expect(page.getByRole('region', { name: 'Tools' })).toHaveCount(0);
    await expect(page.getByRole('complementary', { name: 'Inspector' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Data dock' })).toHaveCount(0);
  });

  test('fills the viewport without page scroll', async ({ page }) => {
    const overflow = await page.evaluate(() => ({
      x: document.documentElement.scrollWidth - window.innerWidth,
      y: document.documentElement.scrollHeight - window.innerHeight,
    }));
    expect(overflow).toEqual({ x: 0, y: 0 });
  });

  test('passes axe in the light theme', async ({ page }) => {
    await expect(page.locator('[data-theme="light"]')).toBeVisible();
    const results = await axe(page).withTags(WCAG_AA).analyze();
    expect(results.violations).toEqual([]);
  });

  test('passes axe in the dark theme', async ({ page }) => {
    await page.getByRole('button', { name: 'Dark theme' }).click();
    await expect(page.locator('[data-theme="dark"]')).toBeVisible();
    const results = await axe(page).withTags(WCAG_AA).analyze();
    expect(results.violations).toEqual([]);
  });

  test('header controls are reachable by keyboard in order', async ({ page }) => {
    // The sidebar toggle joins them once a project is open.
    const expected = [
      'Open Engineering Tools home',
      'Shortcuts',
      'Docs',
      'Report issue',
      'GitHub repository',
      'Dark theme',
    ];
    const reached: string[] = [];
    for (let i = 0; i < expected.length; i++) {
      await page.keyboard.press('Tab');
      reached.push(
        await page.evaluate(
          () =>
            document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? '',
        ),
      );
    }
    expect(reached).toEqual(expected);
  });
});
