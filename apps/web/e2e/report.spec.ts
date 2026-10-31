import { type Page } from '@playwright/test';
import { animationsSettled, axe, expect, graphProject, sampleImage, seedProject, test } from './fixtures';

// Task 3.7: the opt-in error reporter. An error nothing caught offers a report; the user reviews it, optionally
// adds the anonymized project, then opens a prefilled GitHub issue or copies the text. Nothing is sent.

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Report a problem' });
const reportText = (page: Page) => dialog(page).getByRole('textbox', { name: 'Report' }).inputValue();

test('reports an uncaught error for review, sending nothing', async ({
  page,
  context,
  browserName,
  baseURL,
}) => {
  const self = new URL(baseURL ?? '').origin;
  const offSite: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== self) offSite.push(request.url());
  });
  await page.goto('/');
  await seedProject(page, graphProject('vector-clean', { width: 2400, height: 1600 }, []), {
    'graphs/g1/original.png': sampleImage('vector-clean'),
  });
  await expect(page.getByRole('application', { name: /^Graph image: vector-clean/ })).toHaveAttribute(
    'data-state',
    'ready',
  );

  await page.evaluate(() => {
    setTimeout(() => {
      throw new TypeError('demo failure in a click handler');
    });
  });
  await page.getByRole('button', { name: 'Report…' }).click();
  await expect(dialog(page)).toBeVisible();
  // The notice makes way for the dialog.
  await expect(page.getByText('Something went wrong', { exact: true })).toHaveCount(0);
  await animationsSettled(page);
  const text = await reportText(page);
  expect(text).toContain('demo failure in a click handler');
  expect(text).toMatch(/- Step: graph 1 of 1 · guide step Calibrate · tool select/);
  expect(text).not.toContain('Project (anonymized)');
  expect((await axe(page).analyze()).violations).toEqual([]);

  await dialog(page)
    .getByRole('checkbox', { name: /Include the project, anonymized/ })
    .check();
  await expect.poll(() => reportText(page)).toContain('"name": "Graph 1"');
  // The graph's name and the project's name stay home.
  expect(await reportText(page)).not.toContain('"name": "vector-clean"');
  expect(await reportText(page)).not.toContain('E2E vector-clean');

  const href =
    (await dialog(page).getByRole('link', { name: 'Open GitHub issue' }).getAttribute('href')) ?? '';
  const url = new URL(href);
  expect(`${url.origin}${url.pathname}`).toBe('https://github.com/shubhs650/curve-digitizer/issues/new');
  expect(url.searchParams.get('body')).toBe(await reportText(page));

  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await dialog(page).getByRole('button', { name: 'Copy report' }).click();
    await expect(page.getByText('Copied the report').first()).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(await reportText(page));
  }
  await dialog(page).getByRole('button', { name: 'Close' }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(offSite).toEqual([]);
});
