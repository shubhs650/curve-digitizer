import { type Page } from '@playwright/test';
import { expect, test } from './fixtures';

// v0.4.0 laptop layout (ADR 47, docs/UX_STUDY.md): at every common screen size no control is squashed or
// clipped, the page never scrolls sideways, the regions never overlap, and the canvas gets most of the room.
// Zoom gestures over the canvas zoom the PDF page or graph, not the app.

const FIXTURES = new URL('../../../packages/pdf/fixtures/', import.meta.url);
const CHART_PDF = new URL('chart.pdf', FIXTURES).pathname;

/** CSS px viewports: laptops at 100 %, 125 % and 150 % scaling, a desktop monitor, and tablet sizes. */
const VIEWPORTS = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1440, height: 900 },
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
] as const;

/** Problems with the current layout, as readable strings; empty when it is sound. */
async function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth)
      problems.push(`page scrolls sideways: ${String(doc.scrollWidth)} px`);
    if (doc.scrollHeight > window.innerHeight)
      problems.push(`page scrolls down: ${String(doc.scrollHeight)} px`);

    const name = (el: Element) =>
      (el.getAttribute('aria-label') ?? el.textContent).trim().replace(/\s+/g, ' ').slice(0, 40);
    // Fluent draws radios and checkboxes over a transparent native input; those inputs are not the control.
    const controls = document.querySelectorAll<HTMLElement>(
      'button, a[href], [role="tab"], select, input:not([type="file"]):not([type="radio"]):not([type="checkbox"]), [role="separator"][tabindex]',
    );
    for (const el of controls) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      if (getComputedStyle(el).visibility === 'hidden') continue;
      if (el.getAttribute('role') === 'separator') continue;
      if (box.height < 20) problems.push(`"${name(el)}" squashed to ${box.height.toFixed(0)} px`);
      if (el.scrollHeight > el.clientHeight + 1)
        problems.push(
          `"${name(el)}" clips its content (${String(el.scrollHeight)} > ${String(el.clientHeight)} px)`,
        );
    }

    const regions = [
      ['sidebar', '[aria-label="Project and pages"]'],
      ['rail', '[role="region"][aria-label="Tools"]'],
      ['canvas', 'main[aria-label="Canvas"]'],
      ['inspector', 'aside[aria-label="Inspector"]'],
      ['dock', 'section[aria-label="Data dock"]'],
    ] as const;
    const boxes = regions.flatMap(([label, selector]) => {
      const el = document.querySelector(selector);
      return el ? [{ label, box: el.getBoundingClientRect() }] : [];
    });
    for (const { label, box } of boxes) {
      if (box.right > window.innerWidth + 0.5 || box.bottom > window.innerHeight + 0.5)
        problems.push(`${label} runs off the window`);
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (!a || !b) continue;
        const w = Math.min(a.box.right, b.box.right) - Math.max(a.box.left, b.box.left);
        const h = Math.min(a.box.bottom, b.box.bottom) - Math.max(a.box.top, b.box.top);
        if (w > 1 && h > 1) problems.push(`${a.label} overlaps ${b.label}`);
      }
    }
    return problems;
  });
}

async function canvasShare(page: Page): Promise<{ width: number; height: number }> {
  const box = await page.getByRole('main', { name: 'Canvas' }).boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error('canvas not laid out');
  return { width: box.width / viewport.width, height: box.height / viewport.height };
}

async function openCropView(page: Page) {
  await page.getByTestId('open-file-input').first().setInputFiles(CHART_PDF);
  const thumbnail = page.getByRole('button', { name: 'Page 1 of chart.pdf' });
  // The sidebar and its toggle exist only once the project is open.
  await expect(page.getByTestId('header-project')).toBeAttached();
  // Narrow windows start with the sidebar hidden.
  if (!(await page.getByRole('complementary', { name: 'Project and pages' }).isVisible()))
    await page.getByRole('button', { name: 'Project sidebar' }).click();
  await thumbnail.click();
  await expect(page.getByTestId('pdf-page')).toHaveAttribute('data-ready', 'true');
}

async function dragOnPage(page: Page, from: readonly [number, number], to: readonly [number, number]) {
  const box = await page.getByTestId('pdf-page').boundingBox();
  if (!box) throw new Error('page view not laid out');
  await page.mouse.move(Math.round(box.x + from[0] * box.width), Math.round(box.y + from[1] * box.height));
  await page.mouse.down();
  await page.mouse.move(Math.round(box.x + to[0] * box.width), Math.round(box.y + to[1] * box.height), {
    steps: 5,
  });
  await page.mouse.up();
}

async function dragBy(page: Page, testId: string, dx: number, dy: number) {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`${testId} not laid out`);
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
}

const graphCanvas = (page: Page) => page.getByRole('application', { name: /^Graph image:/ });

test.describe('laptop layout', () => {
  // Layout is the same code in every engine; the target browser runs it (ADR 36, 45).
  test.skip(({ browserName }) => browserName !== 'chromium', 'layout runs on Chromium');

  for (const viewport of VIEWPORTS) {
    const size = `${String(viewport.width)}×${String(viewport.height)}`;
    test(`home, crop view and graph lay out cleanly at ${size}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Curve Digitizer' })).toBeVisible();
      expect(await layoutProblems(page), 'home').toEqual([]);

      await openCropView(page);
      await dragOnPage(page, [0.15, 0.15], [0.85, 0.6]);
      expect(await layoutProblems(page), 'crop view').toEqual([]);

      await page
        .getByRole('region', { name: 'Crop' })
        .getByRole('button', { name: 'Crop to new graph' })
        .click();
      await expect(graphCanvas(page)).toHaveAttribute('data-state', 'ready');
      expect(await layoutProblems(page), 'graph').toEqual([]);

      // On laptops and up the canvas gets over half the width and most of the height.
      if (viewport.width >= 1280) {
        const share = await canvasShare(page);
        expect(share.width).toBeGreaterThanOrEqual(0.5);
        expect(share.height).toBeGreaterThanOrEqual(0.6);
      }
    });
  }

  test('the data dock resizes by its splitter and keeps the canvas usable', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await openCropView(page);
    await page.getByRole('button', { name: 'Whole page' }).click();
    await page.getByRole('button', { name: 'Crop to new graph' }).click();
    await expect(graphCanvas(page)).toHaveAttribute('data-state', 'ready');

    // 768 px tall: the dock starts collapsed.
    const toggle = page.getByRole('button', { name: 'Data dock' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    const splitter = page.getByRole('separator', { name: 'Resize the data dock' });
    const before = Number(await splitter.getAttribute('aria-valuenow'));
    await dragBy(page, 'dock-splitter', 0, -1000);
    const after = Number(await splitter.getAttribute('aria-valuenow'));
    expect(after).toBeGreaterThan(before);
    const canvas = await page.getByRole('main', { name: 'Canvas' }).boundingBox();
    expect(canvas?.height).toBeGreaterThanOrEqual(199);
    expect(await layoutProblems(page)).toEqual([]);
  });
});

test.describe('zoom over the canvas', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Ctrl+wheel and pinch: Chromium is the target');

  test('Ctrl+wheel and Ctrl + zoom the PDF page, not the app', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await openCropView(page);
    const pdfPage = page.getByTestId('pdf-page');
    const fitted = Number(await pdfPage.getAttribute('data-scale'));
    const box = await pdfPage.boundingBox();
    if (!box) throw new Error('page view not laid out');

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -300);
    await page.keyboard.up('Control');
    await expect.poll(async () => Number(await pdfPage.getAttribute('data-scale'))).toBeGreaterThan(fitted);
    // The app did not zoom: the window is as wide in CSS px as before.
    expect(await page.evaluate(() => window.innerWidth)).toBe(1366);

    const zoomed = Number(await pdfPage.getAttribute('data-scale'));
    await page.keyboard.press('Control+Equal');
    await expect.poll(async () => Number(await pdfPage.getAttribute('data-scale'))).toBeGreaterThan(zoomed);
    await page.keyboard.press('Control+Digit0');
    await expect.poll(async () => Number(await pdfPage.getAttribute('data-scale'))).toBeCloseTo(fitted, 5);
    expect(await page.evaluate(() => window.innerWidth)).toBe(1366);
  });

  test('Ctrl + and Ctrl+wheel zoom the graph, not the app', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await openCropView(page);
    await page.getByRole('button', { name: 'Whole page' }).click();
    await page.getByRole('button', { name: 'Crop to new graph' }).click();
    await expect(graphCanvas(page)).toHaveAttribute('data-state', 'ready');
    const percent = page.getByTestId('zoom-percent');
    const fitted = await percent.textContent();

    // Focus is on a sidebar button, not the canvas: Ctrl + still zooms the graph.
    await page.getByRole('button', { name: 'Export' }).focus();
    await page.keyboard.press('Control+Equal');
    await expect(percent).not.toHaveText(fitted ?? '');
    expect(await page.evaluate(() => window.innerWidth)).toBe(1366);
    await page.keyboard.press('Control+Digit0');
    await expect(percent).toHaveText(fitted ?? '');
  });
});

test.describe('crop rectangle', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'pointer gestures: Chromium is the target');

  test('resizes by a handle, moves by dragging inside, and clears with Escape', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/');
    await openCropView(page);
    await expect(page.getByTestId('crop-hint')).toBeVisible();
    await dragOnPage(page, [0.2, 0.2], [0.5, 0.5]);
    await expect(page.getByTestId('crop-hint')).toBeHidden();
    const size = page.getByTestId('crop-rect-size');
    const panelSize = page.getByTestId('crop-size');
    const drawn = await size.textContent();
    // The label on the page and the panel agree.
    await expect(panelSize).toHaveText(`${drawn ?? ''} at 300 DPI`);

    await dragBy(page, 'crop-handle-se', 60, 40);
    await expect(size).not.toHaveText(drawn ?? '');
    const resized = await size.textContent();
    await expect(panelSize).toHaveText(`${resized ?? ''} at 300 DPI`);

    const rect = page.getByTestId('crop-rect');
    const before = await rect.boundingBox();
    await dragBy(page, 'crop-rect', 30, 20);
    const after = await rect.boundingBox();
    expect((after?.x ?? 0) - (before?.x ?? 0)).toBeCloseTo(30, 0);
    expect((after?.y ?? 0) - (before?.y ?? 0)).toBeCloseTo(20, 0);
    // Moving keeps the size.
    await expect(size).toHaveText(resized ?? '');

    await page.getByTestId('pdf-page').press('Escape');
    await expect(rect).toBeHidden();
    await expect(page.getByRole('button', { name: 'Crop to new graph' })).toBeDisabled();
  });
});
