import { expect, test } from '@playwright/test';

test('the app shell loads without errors or third-party requests', async ({ page, baseURL }) => {
  const errors: string[] = [];
  const foreignRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== new URL(baseURL ?? '').origin) {
      foreignRequests.push(request.url());
    }
  });

  await page.goto('/');

  await expect(page).toHaveTitle('Curve Digitizer');
  await expect(page.locator('#root')).toBeAttached();
  expect(errors).toEqual([]);
  expect(foreignRequests).toEqual([]);
});
