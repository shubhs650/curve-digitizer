import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo, Server } from 'node:net';
import { extname, join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

// Resolves once a service worker controls the page, i.e. the app shell is precached and served offline.
async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

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

  test('reloads offline after the first load', async ({ page, context }) => {
    await page.goto('/');
    await waitForServiceWorker(page);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('banner').getByText('Curve Digitizer')).toBeVisible();
    await expect(page.getByRole('main', { name: 'Canvas' })).toBeVisible();

    // Deep links fall back to the precached shell too.
    await page.goto('/docs');
    await expect(page.getByRole('banner').getByText('Curve Digitizer')).toBeVisible();
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
    const origin = await serveDist((path, body) =>
      path === '/sw.js' ? Buffer.concat([body, Buffer.from(`\n// deploy ${String(deployed)}\n`)]) : body,
    );
    try {
      await page.goto(origin);
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
      await closeServers();
    }
  });
});

const servers: Server[] = [];

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

async function serveDist(transform: (path: string, body: Buffer) => Buffer): Promise<string> {
  const dist = join(import.meta.dirname, '..', 'dist');
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    const file = join(dist, path === '/' ? 'index.html' : path);
    if (!file.startsWith(dist) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    response.end(transform(path, readFileSync(file)));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve));
  return `http://localhost:${String((server.address() as AddressInfo).port)}/`;
}

async function closeServers(): Promise<void> {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
}
