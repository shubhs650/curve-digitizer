import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { manyPagePdf } from './bigPdf';

// P7: "opening a 1000-page PDF and cropping 5 pages keeps JS heap < 500 MB", measured with performance.memory,
// which only Chromium has. The pages render in the render worker; this is the page's own heap.

const P7_HEAP_BYTES = 500e6;
const NAME = 'thousand.pdf';

const pages = (page: Page) =>
  page
    .getByRole('complementary', { name: 'Project and pages' })
    .getByRole('list', { name: `Pages of ${NAME}` });

test('P7: a 1000-page PDF and five crops keep the JS heap under 500 MB', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'performance.memory is Chromium-only');
  test.setTimeout(180_000);
  await page.goto('/');
  await page
    .getByTestId('open-file-input')
    .first()
    .setInputFiles({ name: NAME, mimeType: 'application/pdf', buffer: manyPagePdf(1000) });
  await expect(pages(page).getByRole('button', { name: `Page 1000 of ${NAME}` })).toBeAttached({
    timeout: 60_000,
  });

  const crop = page.getByRole('region', { name: 'Crop' });
  for (const n of [1, 250, 500, 750, 1000]) {
    await pages(page)
      .getByRole('button', { name: `Page ${String(n)} of ${NAME}` })
      .click();
    await expect(page.getByTestId('pdf-page')).toHaveAttribute('data-ready', 'true');
    await crop.getByRole('button', { name: 'Whole page' }).click();
    await crop.getByLabel('Resolution').selectOption('300');
    await crop.getByRole('button', { name: 'Crop to new graph' }).click();
    await expect(page.getByRole('application', { name: /^Graph image:/ })).toHaveAttribute(
      'data-state',
      'ready',
      {
        timeout: 30_000,
      },
    );
  }

  const heap = await page.evaluate(
    () => (performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize,
  );
  test.info().annotations.push({ type: 'P7 JS heap', description: `${(heap / 1e6).toFixed(0)} MB` });
  expect(heap).toBeLessThan(P7_HEAP_BYTES);
});
