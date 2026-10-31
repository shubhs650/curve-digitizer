import { expect, serveDist, test, waitForServiceWorker } from './fixtures';

test.describe('PWA', () => {
  test('links a manifest with icons and file handlers for .cdz and images', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBe('/manifest.webmanifest');
    const response = await request.get(href ?? '');
    expect(response.ok()).toBe(true);
    const manifest = (await response.json()) as {
      name: string;
      icons: { src: string }[];
      file_handlers: { accept: Record<string, string[]> }[];
    };
    expect(manifest.name).toBe('Curve Digitizer');
    const extensions = manifest.file_handlers.flatMap((handler) => Object.values(handler.accept).flat());
    expect(extensions).toEqual(expect.arrayContaining(['.cdz', '.png', '.jpg', '.webp']));
    for (const icon of manifest.icons) {
      expect((await request.get(`/${icon.src}`)).ok(), icon.src).toBe(true);
    }
  });

  test('is cross-origin isolated, so workers can share a cancel flag', async ({ page }) => {
    await page.goto('/');
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
    expect(await page.evaluate(() => typeof SharedArrayBuffer)).toBe('function');
  });

  test('does not offer an update after reloading a fresh install', async ({ page }) => {
    await page.goto('/');
    await waitForServiceWorker(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    // Give a spurious "waiting" worker time to show up.
    await page.waitForTimeout(2000);
    await expect(page.getByText('New version available')).toHaveCount(0);
  });

  test('reloads offline after the first load', async ({ page }) => {
    const host = await serveDist();
    await page.goto(host.origin);
    await waitForServiceWorker(page);

    await host.close();
    await page.reload();
    await expect(page.getByRole('banner').getByText('Curve Digitizer')).toBeVisible();
    await expect(page.getByRole('main', { name: 'Canvas' })).toBeVisible();
    // The precached response keeps COOP/COEP, so workers still get SharedArrayBuffer offline.
    expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);

    // Deep links fall back to the precached shell too.
    await page.goto(`${host.origin}docs/calibration`);
    await expect(page.getByRole('heading', { level: 1, name: 'Calibration' })).toBeVisible();
  });

  test('says "Ready offline" once the shell, then PDF support, are cached', async ({ page }) => {
    await page.goto('/');
    await waitForServiceWorker(page);
    const status = page.getByTestId('offline-status');
    await expect(status).toHaveText('Ready offline for images');
    await page
      .getByTestId('open-file-input')
      .first()
      .setInputFiles(new URL('../../../packages/pdf/fixtures/chart.pdf', import.meta.url).pathname);
    await expect(status).toHaveText('Ready offline', { timeout: 15_000 });
  });

  test('enforces a CSP that the shell runs under without violations', async ({ page }) => {
    await page.addInitScript(() => {
      const violations: string[] = [];
      (window as unknown as { cspViolations: string[] }).cspViolations = violations;
      document.addEventListener('securitypolicyviolation', (event) => {
        violations.push(`${event.violatedDirective} ${event.blockedURI}`);
      });
    });
    await page.goto('/');
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(csp).toContain("connect-src 'self'");

    // Exercise styling paths: theme switch re-renders every Griffel class, the tooltip mounts a portal.
    await page.getByRole('button', { name: 'Dark theme' }).click();
    await page.getByRole('button', { name: 'Project sidebar' }).hover();
    await expect(page.getByRole('tooltip')).toBeVisible();

    // The policy is live: a fetch to another origin is refused by the browser.
    const blocked = await page.evaluate(async () => {
      try {
        await fetch('https://example.com/');
        return false;
      } catch {
        return true;
      }
    });
    expect(blocked).toBe(true);

    const violations = await page.evaluate(
      () => (window as unknown as { cspViolations: string[] }).cspViolations,
    );
    expect(violations).toEqual(['connect-src https://example.com/']);
  });

  test('offers a new version and reloads into it on request', async ({ page }) => {
    // Playwright cannot intercept the browser's own service-worker script fetch, so a second static server
    // over the same build stands in for the host: flipping `deployed` serves a byte-different sw.js, as a
    // fresh deploy would.
    let deployed = 1;
    const host = await serveDist((path, body) =>
      path === '/sw.js' ? Buffer.concat([body, Buffer.from(`\n// deploy ${String(deployed)}\n`)]) : body,
    );
    try {
      await page.goto(host.origin);
      await waitForServiceWorker(page);
      await expect(page.getByText('New version available')).toBeHidden();

      deployed = 2;
      await page.reload();
      const prompt = page.getByText('New version available');
      await expect(prompt).toBeVisible();

      const reloaded = page.waitForEvent('framenavigated');
      await page.getByRole('button', { name: 'Reload' }).click();
      await reloaded;
      await expect(page.getByRole('banner').getByText('Curve Digitizer')).toBeVisible();
      await expect(prompt).toBeHidden();
      const state = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return {
          waiting: Boolean(registration?.waiting),
          controlled: navigator.serviceWorker.controller !== null,
        };
      });
      expect(state).toEqual({ waiting: false, controlled: true });
    } finally {
      await host.close();
    }
  });
});
