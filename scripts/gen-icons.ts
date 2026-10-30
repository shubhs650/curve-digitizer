// Rasterizes the checked-in SVG app icons to the PNG sizes the web app manifest and iOS need.
// Usage: node scripts/gen-icons.ts   (re-run after editing apps/web/public/icon*.svg, then commit the PNGs)
// Uses the Playwright Chromium already required for e2e, so icon generation adds no dependency.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

export interface IconTarget {
  readonly source: 'icon.svg' | 'icon-maskable.svg';
  readonly output: string;
  readonly size: number;
}

// Maskable artwork is full-bleed, which is also what iOS wants for apple-touch-icon (it rounds the corners itself).
export const ICON_TARGETS: readonly IconTarget[] = [
  { source: 'icon.svg', output: 'pwa-192x192.png', size: 192 },
  { source: 'icon.svg', output: 'pwa-512x512.png', size: 512 },
  { source: 'icon-maskable.svg', output: 'pwa-maskable-512x512.png', size: 512 },
  { source: 'icon-maskable.svg', output: 'apple-touch-icon-180x180.png', size: 180 },
];

const publicDir = new URL('../apps/web/public/', import.meta.url);

async function main(): Promise<void> {
  const browser = await chromium.launch();
  try {
    for (const { source, output, size } of ICON_TARGETS) {
      const svg = readFileSync(new URL(source, publicDir), 'utf8');
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      await page.setContent(
        `<style>html,body{margin:0}svg{display:block;width:${String(size)}px;height:${String(size)}px}</style>${svg}`,
      );
      await page.screenshot({ path: fileURLToPath(new URL(output, publicDir)), omitBackground: true });
      await page.close();
      console.log(`${output} ${String(size)}x${String(size)}`);
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
