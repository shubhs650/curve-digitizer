import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { graphProject, pageXY, sampleImage, seedProject } from './fixtures';

// Task 1.10: projects autosave within 5 s and reopen after the tab is killed (R3); a saved .cdz opens on another
// device with the same project.json and byte-identical images (R2).

const DATASET = {
  id: 'd1',
  name: 'Pump A',
  color: '#0072b2',
  mode: 'function',
  xUnit: '',
  yUnit: '',
  sourceRef: '',
  notes: '',
  points: [
    {
      id: 'p1',
      px: [600, 900],
      value: [0, 0],
      sigma: [0, 0],
      excludedFromFit: false,
      outOfRange: false,
      origin: 'manual',
    },
  ],
};
const PROJECT = graphProject('vector-clean', { width: 2400, height: 1600 }, [DATASET]);

const canvas = (page: Page) => page.getByRole('application', { name: /^Graph image: vector-clean/ });
const rows = (page: Page) => page.getByRole('grid', { name: 'Points of Pump A' }).getByRole('row');

/** A file of a stored project, read straight from the page's OPFS. */
async function storedFile(page: Page, projectId: string, path: string): Promise<string | null> {
  return page.evaluate(
    async ({ projectId, path }) => {
      try {
        let dir = await (await navigator.storage.getDirectory()).getDirectoryHandle('projects');
        dir = await dir.getDirectoryHandle(projectId);
        const parts = path.split('/');
        const name = parts.pop() ?? '';
        for (const part of parts) dir = await dir.getDirectoryHandle(part);
        const bytes = new Uint8Array(await (await (await dir.getFileHandle(name)).getFile()).arrayBuffer());
        return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''));
      } catch {
        return null;
      }
    },
    { projectId, path },
  );
}

const storedJson = async (page: Page, projectId: string) => {
  const base64 = await storedFile(page, projectId, 'project.json');
  return base64 === null
    ? null
    : (JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as Record<string, unknown>);
};

const withoutModified = (project: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(project).filter(([key]) => key !== 'modified'));

/** The part of a stored project.json the autosave check reads. */
interface StoredPoints {
  readonly graphs: readonly { readonly datasets: readonly { readonly points: readonly unknown[] }[] }[];
}

test.describe('project files', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await seedProject(page, PROJECT, { 'graphs/g1/original.png': sampleImage('vector-clean') });
    await expect(canvas(page)).toHaveAttribute('data-state', 'ready');
  });

  test('autosaves within 5 s of an edit and reopens the project after the tab is killed (R3)', async ({
    page,
    context,
  }) => {
    await page.keyboard.press('s');
    await page.keyboard.press('p');
    const [x, y] = await pageXY(page, [1500, 700]);
    await page.mouse.click(x, y);
    await expect(rows(page)).toHaveCount(3);
    const edited = Date.now();
    await expect
      .poll(
        async () =>
          ((await storedJson(page, PROJECT.id)) as StoredPoints | null)?.graphs[0]?.datasets[0]?.points
            .length,
        {
          timeout: 5000,
          intervals: [100],
        },
      )
      .toBe(2);
    test.info().annotations.push({
      type: 'R3',
      description: `saved ${String(Date.now() - edited)} ms after the edit`,
    });

    // No beforeunload, no flush: as close to a crash as a browser test gets.
    await page.close({ runBeforeUnload: false });
    const reopened = await context.newPage();
    await reopened.goto('/');
    await expect(canvas(reopened)).toHaveAttribute('data-state', 'ready');
    await expect(rows(reopened)).toHaveCount(3);
  });

  test('saves a .cdz that opens elsewhere with the same project and byte-identical images (R2)', async ({
    page,
    browser,
  }) => {
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save .cdz' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('E2E vector-clean.cdz');
    const path = await download.path();
    const original = await storedJson(page, PROJECT.id);

    // A fresh browser context has its own, empty OPFS: another device as far as the app can tell.
    const elsewhere = await browser.newContext();
    const other = await elsewhere.newPage();
    await other.goto('/');
    await expect(other.getByText('No saved projects yet.')).toBeVisible();
    await other
      .getByTestId('open-file-input')
      .first()
      .setInputFiles({
        name: 'E2E vector-clean.cdz',
        mimeType: 'application/octet-stream',
        buffer: await readFile(path),
      });
    await expect(canvas(other)).toHaveAttribute('data-state', 'ready');
    await expect(rows(other)).toHaveCount(2);

    const reopened = await storedJson(other, PROJECT.id);
    expect(reopened && withoutModified(reopened)).toEqual(original && withoutModified(original));
    expect(await storedFile(other, PROJECT.id, 'graphs/g1/original.png')).toBe(
      sampleImage('vector-clean').toString('base64'),
    );
    await elsewhere.close();
  });
});
