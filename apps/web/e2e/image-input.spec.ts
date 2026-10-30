import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

// Task 1.1: images come in through the file picker, a drop or a paste, become Graphs of a project in OPFS,
// and the project survives a reload.

const SAMPLE = new URL('../../../samples/vector-clean/source.png', import.meta.url);
const SAMPLE_BYTES = readFileSync(SAMPLE);

const sidebar = (page: Page) => page.getByRole('complementary', { name: 'Project and pages' });

async function expectGraphShown(page: Page, name: string, size: string) {
  await expect(sidebar(page).getByRole('button', { name, exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );
  const image = page.getByRole('application', { name: `Graph image: ${name}, ${size}` });
  await expect(image).toHaveAttribute('data-state', 'ready');
}

/** Dispatches a drop or paste carrying one file, built in the page from base64 bytes. */
async function sendFile(page: Page, how: 'drop' | 'paste', name: string, base64: string, type: string) {
  await page.evaluate(
    ({ how, name, base64, type }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const transfer = new DataTransfer();
      transfer.items.add(new File([bytes], name, { type }));
      if (how === 'drop') {
        const init = { dataTransfer: transfer, bubbles: true, cancelable: true };
        document.body.dispatchEvent(new DragEvent('dragenter', init));
        document.body.dispatchEvent(new DragEvent('dragover', init));
        document.body.dispatchEvent(new DragEvent('drop', init));
      } else {
        document.body.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
        );
      }
    },
    { how, name, base64, type },
  );
}

test.describe('image input', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('No saved projects yet.')).toBeVisible();
  });

  test('file picker → new project with the graph, kept across a reload', async ({ page }) => {
    await page.getByTestId('image-file-input').setInputFiles(SAMPLE.pathname);
    await expectGraphShown(page, 'source', '2400 × 1600 px');

    await page.reload();
    const saved = page.getByRole('list', { name: 'Saved projects' });
    await expect(saved.getByText('source', { exact: true })).toBeVisible();
    await expect(saved.getByText(/1 graph$/)).toBeVisible();
    await saved.getByRole('button', { name: 'Open source' }).click();
    await expectGraphShown(page, 'source', '2400 × 1600 px');
  });

  test('the open project passes axe', async ({ page }) => {
    await page.getByTestId('image-file-input').setInputFiles(SAMPLE.pathname);
    await expectGraphShown(page, 'source', '2400 × 1600 px');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('drag and drop adds a graph', async ({ page }) => {
    await sendFile(page, 'drop', 'dropped.png', SAMPLE_BYTES.toString('base64'), 'image/png');
    await expectGraphShown(page, 'dropped', '2400 × 1600 px');
  });

  test('pasting a JPEG converts it in the worker and adds a graph to the open project', async ({ page }) => {
    await page.getByTestId('image-file-input').setInputFiles(SAMPLE.pathname);
    await expectGraphShown(page, 'source', '2400 × 1600 px');

    const jpeg = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 48;
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = '#336699';
        context.fillRect(0, 0, 64, 48);
      }
      return canvas.toDataURL('image/jpeg').split(',')[1] ?? '';
    });
    await sendFile(page, 'paste', 'image.jpg', jpeg, 'image/jpeg');
    await expectGraphShown(page, 'image', '64 × 48 px');
    await expect(sidebar(page).getByRole('listitem')).toHaveCount(2);
  });

  test('a file that is not an image is reported and nothing is created', async ({ page }) => {
    await sendFile(page, 'drop', 'notes.txt', Buffer.from('hello').toString('base64'), 'text/plain');
    // The toast text is also mirrored into an aria-live region.
    await expect(page.getByText('Could not open notes.txt').first()).toBeVisible();
    await expect(page.getByText('No project open.')).toBeVisible();
  });
});
