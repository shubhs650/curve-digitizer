// Rasterizes samples/<name>/source.svg to source.png at 1 px per SVG unit with the Playwright Chromium the
// repo already uses, so the image and ground-truth.json share one pixel grid (ADR 25). Called by
// scripts/gen-samples.py. Usage: node scripts/render-samples.ts <sample-dir>...
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { decodePng, encodePng, type RasterImage } from './samples/png.ts';

/** Drops an opaque alpha channel and collapses gray RGB to one channel, so the committed PNG stays small. */
export function compact(image: RasterImage): RasterImage {
  const { width, height, channels, data } = image;
  const n = width * height;
  let opaque = channels === 4;
  let gray = channels !== 1;
  for (let i = 0; i < n && (opaque || gray); i++) {
    const o = i * channels;
    if (channels === 4 && data[o + 3] !== 255) opaque = false;
    if (data[o] !== data[o + 1] || data[o] !== data[o + 2]) gray = false;
  }
  if (channels === 4 && !opaque) return image;
  const out = gray ? 1 : 3;
  if (out === channels) return image;
  const packed = new Uint8Array(n * out);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < out; c++) packed[i * out + c] = data[i * channels + c] ?? 0;
  }
  return { width, height, channels: out, data: packed };
}

function svgSize(svg: string): { width: number; height: number } {
  const tag = /<svg\b[^>]*>/.exec(svg)?.[0] ?? '';
  const width = Number(/\bwidth="(\d+)"/.exec(tag)?.[1]);
  const height = Number(/\bheight="(\d+)"/.exec(tag)?.[1]);
  if (!Number.isInteger(width) || !Number.isInteger(height))
    throw new Error('source.svg needs integer width and height');
  return { width, height };
}

async function main(dirs: readonly string[]): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    for (const dir of dirs) {
      const svg = readFileSync(join(dir, 'source.svg'), 'utf8');
      const { width, height } = svgSize(svg);
      await page.setViewportSize({ width, height });
      await page.setContent(
        `<!doctype html><html><head><style>html,body{margin:0;padding:0;overflow:hidden}svg{display:block}</style>` +
          `</head><body>${svg}</body></html>`,
      );
      await page.evaluate(() => document.fonts.ready);
      const shot = await page.screenshot({ clip: { x: 0, y: 0, width, height }, type: 'png' });
      const image = compact(decodePng(shot));
      writeFileSync(join(dir, 'source.png'), encodePng(image));
      console.log(
        `${dir}/source.png  ${String(width)}×${String(height)}  ${String(image.channels)} channel(s)`,
      );
    }
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  await main(process.argv.slice(2));
}
