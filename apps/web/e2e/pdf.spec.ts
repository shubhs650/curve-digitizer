import { type BrowserContext, type Page } from '@playwright/test';
import { animationsSettled, expect, test, axe } from './fixtures';

// Task 1.7: PDFs open through PDFium, which loads only on the first PDF (P2) and whose absence leaves the app
// working image-only (R5); protected PDFs ask for their password and restricted ones say what they forbid (R6).

const FIXTURES = new URL('../../../packages/pdf/fixtures/', import.meta.url);
const pdf = (name: string) => new URL(name, FIXTURES).pathname;
const SAMPLE_PNG = new URL('../../../samples/vector-clean/source.png', import.meta.url).pathname;

const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Project and pages' });
const pages = (page: Page, file: string) => sidebar(page).getByRole('list', { name: `Pages of ${file}` });

/** Every URL the page, its workers and its service worker request. */
function recordRequests(context: BrowserContext): string[] {
  const urls: string[] = [];
  context.on('request', (request) => urls.push(request.url()));
  return urls;
}

async function open(page: Page, path: string) {
  // The sidebar and an empty project's canvas both offer the picker.
  await page.getByTestId('open-file-input').first().setInputFiles(path);
}

async function expectRenderedPages(page: Page, file: string, count: number) {
  const thumbs = pages(page, file).getByRole('img');
  await expect(thumbs).toHaveCount(count);
  for (let i = 0; i < count; i++) await expect(thumbs.nth(i)).toHaveAttribute('data-ready', 'true');
}

test.describe('PDF input', () => {
  test('PDFium is not requested for images, then loads on the first PDF (P2)', async ({ page, context }) => {
    const requests = recordRequests(context);
    await page.goto('/');
    await expect(page.getByText('No saved projects yet.')).toBeVisible();
    await open(page, SAMPLE_PNG);
    await expect(page.getByRole('application', { name: /Graph image: source/ })).toHaveAttribute(
      'data-state',
      'ready',
    );
    expect(requests.filter((url) => url.includes('pdfium'))).toEqual([]);

    await open(page, pdf('chart.pdf'));
    await expectRenderedPages(page, 'chart.pdf', 3);
    expect(requests.filter((url) => url.includes('pdfium')).length).toBeGreaterThanOrEqual(2);
  });

  test('keeps the PDF in the project and opens it again after a reload', async ({ page }) => {
    await page.goto('/');
    await open(page, pdf('chart.pdf'));
    await expectRenderedPages(page, 'chart.pdf', 3);
    await expect(sidebar(page).getByText('3 pages')).toBeVisible();

    // A reload reopens the project that was open (R3).
    await page.reload();
    await expectRenderedPages(page, 'chart.pdf', 3);
  });

  test('asks for the password, says when it is wrong, and asks again after a reload (R6)', async ({
    page,
  }) => {
    await page.goto('/');
    await open(page, pdf('chart-password.pdf'));
    const dialog = page.getByRole('dialog', { name: 'Password for “chart-password.pdf”' });
    await dialog.getByLabel('Password').fill('open-sesam');
    await dialog.getByRole('button', { name: 'Open' }).click();
    await expect(dialog.getByText('The password is not correct.')).toBeVisible();
    await expect(dialog.getByLabel('Password')).toHaveValue('');
    await dialog.getByLabel('Password').fill('open-sesame');
    await dialog.getByRole('button', { name: 'Open' }).click();
    await expect(dialog).toBeHidden();
    await expectRenderedPages(page, 'chart-password.pdf', 3);

    // Passwords are never stored, so a reopened project asks again.
    await page.reload();
    await sidebar(page).getByRole('button', { name: 'Unlock…' }).click();
    await dialog.getByLabel('Password').fill('open-sesame');
    await dialog.getByRole('button', { name: 'Open' }).click();
    await expectRenderedPages(page, 'chart-password.pdf', 3);
  });

  test('honours a no-copy permission (R6)', async ({ page }) => {
    await page.goto('/');
    await open(page, pdf('chart-no-copy.pdf'));
    await expectRenderedPages(page, 'chart-no-copy.pdf', 3);
    await expect(sidebar(page).getByText(/does not allow copying its content/)).toBeVisible();
  });

  test('passes axe with a PDF open and with the password dialog', async ({ page }) => {
    await page.goto('/');
    await open(page, pdf('chart-no-copy.pdf'));
    await expectRenderedPages(page, 'chart-no-copy.pdf', 3);
    expect((await axe(page).analyze()).violations).toEqual([]);

    await open(page, pdf('chart-password.pdf'));
    await expect(page.getByRole('dialog')).toBeVisible();
    await animationsSettled(page);
    expect((await axe(page).analyze()).violations).toEqual([]);
  });
});

test.describe('PDFium unavailable (R5)', () => {
  // Route PDFium's glue and wasm to a network error, bypassing the service worker so nothing is served from cache.
  test.use({ serviceWorkers: 'block' });

  test('says PDF support is missing and keeps working with images', async ({ page, context }) => {
    await context.route(/pdfium/, (route) => route.abort());
    await page.goto('/');
    await open(page, pdf('chart.pdf'));
    await expect(page.getByText('PDF support could not be loaded').first()).toBeVisible();
    await expect(page.getByText('No project open.')).toBeVisible();

    await open(page, SAMPLE_PNG);
    await expect(page.getByRole('application', { name: /Graph image: source/ })).toHaveAttribute(
      'data-state',
      'ready',
    );
  });
});
