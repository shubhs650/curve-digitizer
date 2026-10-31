import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import {
  test as base,
  type BrowserContext,
  devices,
  expect,
  type Download,
  type Page,
  type PlaywrightWorkerArgs,
} from '@playwright/test';
import { CROSS_ORIGIN_ISOLATION_HEADERS } from '../config/headers';

/**
 * Playwright's test with one change for WebKit: its default contexts are ephemeral, and an ephemeral WebKit
 * context (like a Safari private window) has no origin private file system, where the app keeps projects. So
 * WebKit tests run in a persistent profile of their own, as Safari does for a normal window.
 */
export const test = base.extend<{ otherContext: BrowserContext }>({
  context: async ({ browserName, context, playwright, baseURL }, use, testInfo) => {
    if (browserName !== 'webkit') {
      await use(context);
      return;
    }
    const persistent = await webkitProfile(playwright, testInfo.outputPath('profile'), baseURL);
    await use(persistent);
    await persistent.close();
  },
  /** A second, separate browser profile with its own empty storage: another device as far as the app can tell. */
  otherContext: async ({ browserName, browser, playwright, baseURL }, use, testInfo) => {
    const other =
      browserName === 'webkit'
        ? await webkitProfile(playwright, testInfo.outputPath('other-profile'), baseURL)
        : await browser.newContext();
    await use(other);
    await other.close();
  },
});

async function webkitProfile(
  playwright: PlaywrightWorkerArgs['playwright'],
  dir: string,
  baseURL: string | undefined,
): Promise<BrowserContext> {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['Desktop Safari'];
  return playwright.webkit.launchPersistentContext(dir, {
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    ...(baseURL === undefined ? {} : { baseURL }),
    acceptDownloads: true,
  });
}

export { expect };

/**
 * axe over the page, leaving out Tabster's focus sentinels: Fluent inserts aria-hidden, focusable `<i>`
 * elements that hand focus straight on, which WebKit gets and axe reports as aria-hidden-focus.
 */
export function axe(page: Page): AxeBuilder {
  return new AxeBuilder({ page }).exclude('[data-tabster-dummy]');
}

export const SAMPLES = new URL('../../../samples/', import.meta.url);

export const sampleImage = (name: string): Buffer => readFileSync(new URL(`${name}/source.png`, SAMPLES));

/**
 * Writes a project straight into the page's OPFS (`projects/<id>/…`, ADR 26), then reloads and opens it from the
 * home screen. Lets e2e tests start from a known project without driving the whole UI.
 */
export async function seedProject(
  page: Page,
  project: { readonly id: string; readonly name: string },
  files: Readonly<Record<string, Buffer>>,
): Promise<void> {
  const entries = Object.entries({ 'project.json': Buffer.from(JSON.stringify(project)), ...files }).map(
    ([path, bytes]) => [path, bytes.toString('base64')] as const,
  );
  await page.evaluate(
    async ({ id, entries }) => {
      const root = await navigator.storage.getDirectory();
      const projects = await root.getDirectoryHandle('projects', { create: true });
      const folder = await projects.getDirectoryHandle(id, { create: true });
      for (const [path, base64] of entries) {
        const parts = path.split('/');
        const fileName = parts.pop() ?? '';
        let dir = folder;
        for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
        const writable = await (await dir.getFileHandle(fileName, { create: true })).createWritable();
        await writable.write(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
        await writable.close();
      }
    },
    { id: project.id, entries },
  );
  await page.reload();
  await page.getByRole('button', { name: `Open ${project.name}` }).click();
}

/** A schema-v1 project with one graph over a sample image and the given datasets. */
export function graphProject(
  sample: string,
  size: { readonly width: number; readonly height: number },
  datasets: readonly object[] = [],
) {
  const now = '2026-10-30T12:00:00.000Z';
  return {
    schemaVersion: 1,
    app: { name: 'curve-digitizer', version: '0.0.0' },
    id: `e2e-${sample}`,
    name: `E2E ${sample}`,
    created: now,
    modified: now,
    settings: { units: 'SI', defaultDpi: 300, snapRadiusPx: 8 },
    sources: [],
    graphs: [
      {
        id: 'g1',
        name: sample,
        source: { kind: 'image', fileName: 'source.png' },
        image: { path: 'graphs/g1/original.png', ...size },
        processing: [],
        calibration: null,
        datasets,
        fits: [],
        view: { zoom: 1, pan: [0, 0] },
      },
    ],
  };
}

export interface CanvasView {
  readonly scale: number;
  readonly offset: readonly [number, number];
}

/** The canvas's current view transform and the canvas's page position. */
export async function canvasView(page: Page): Promise<{ view: CanvasView; left: number; top: number }> {
  const container = page.locator('[data-view]');
  const json = await container.getAttribute('data-view');
  expect(json).not.toBeNull();
  const box = await container.boundingBox();
  if (!box || json === null) throw new Error('canvas not laid out');
  return { view: JSON.parse(json) as CanvasView, left: box.x, top: box.y };
}

/** Page coordinates of an image px. */
export async function pageXY(page: Page, px: readonly [number, number]): Promise<[number, number]> {
  const { view, left, top } = await canvasView(page);
  return [left + px[0] * view.scale + view.offset[0], top + px[1] * view.scale + view.offset[1]];
}

/**
 * Waits for every running CSS or Web Animations animation to end. Fluent fades dialogs in; axe measuring
 * contrast mid-fade sees blended, too-light text.
 */
export async function animationsSettled(page: Page): Promise<void> {
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
}

/** A download's file name. WebKit's downloads suggest spaces as underscores; the names tested have none of their own. */
export function downloadName(download: Download): string {
  return download.suggestedFilename().replaceAll('_', ' ');
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
};

export interface StaticHost {
  readonly origin: string;
  /** Stops serving and drops open connections: the host is gone, as when the device goes offline. */
  readonly close: () => Promise<void>;
}

/**
 * A second static server over the production build, with the same isolation headers as the host. Lets a test
 * change what is deployed (a byte-different sw.js) or take the host away, which works in every browser where
 * `context.setOffline` does not (WebKit fails a reload under it).
 */
export async function serveDist(
  transform: (path: string, body: Buffer) => Buffer = (_, body) => body,
): Promise<StaticHost> {
  const dist = join(import.meta.dirname, '..', 'dist');
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    const file = join(dist, path === '/' ? 'index.html' : path);
    if (!file.startsWith(dist) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, {
      ...CROSS_ORIGIN_ISOLATION_HEADERS,
      'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    response.end(transform(path, readFileSync(file)));
  });
  await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve));
  return {
    origin: `http://localhost:${String((server.address() as AddressInfo).port)}/`,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
        server.closeAllConnections();
      }),
  };
}

/** Resolves once a service worker controls the page, i.e. the app shell is precached and served offline. */
export async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}
