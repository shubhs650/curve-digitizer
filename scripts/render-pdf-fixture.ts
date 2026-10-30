// Prints sample charts into a vector PDF with the Playwright Chromium the repo already uses. Called by
// scripts/gen-pdf-fixtures.py, which then derives the password-protected and permission-restricted copies.
// Usage: node scripts/render-pdf-fixture.ts <out.pdf> <sample>...
//
// Every page is A4 landscape (842 × 595 pt) with the sample's SVG scaled to 720 pt wide and centred, so one
// SVG unit (= one source.png pixel) is CHART_PT_PER_PX points and a crop at 72 / CHART_PT_PER_PX DPI
// reproduces source.png's pixel grid.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { SAMPLES_DIR } from './samples/sample.ts';

export const PAGE_PT = { width: 842, height: 595 } as const;
export const CHART_WIDTH_PT = 720;

async function main(out: string, samples: readonly string[]): Promise<void> {
  const svgs = samples.map((s) => readFileSync(join(SAMPLES_DIR, s, 'source.svg'), 'utf8'));
  const pages = svgs
    .map((svg) => {
      const width = Number(/\bwidth="(\d+)"/.exec(svg)?.[1]);
      const height = Number(/\bheight="(\d+)"/.exec(svg)?.[1]);
      const h = (CHART_WIDTH_PT * height) / width;
      const left = (PAGE_PT.width - CHART_WIDTH_PT) / 2;
      const top = (PAGE_PT.height - h) / 2;
      const sized = svg.replace(
        /<svg\b/,
        `<svg style="position:absolute;left:${String(left)}pt;top:${String(top)}pt;width:${String(CHART_WIDTH_PT)}pt;height:${String(h)}pt" viewBox="0 0 ${String(width)} ${String(height)}"`,
      );
      return `<section>${sized}</section>`;
    })
    .join('');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(
      `<!doctype html><html><head><style>@page{size:${String(PAGE_PT.width)}pt ${String(PAGE_PT.height)}pt;margin:0}` +
        `html,body{margin:0;padding:0}section{position:relative;width:${String(PAGE_PT.width)}pt;` +
        `height:${String(PAGE_PT.height)}pt;overflow:hidden;break-after:page}</style></head><body>${pages}</body></html>`,
    );
    await page.evaluate(() => document.fonts.ready);
    writeFileSync(out, await page.pdf({ preferCSSPageSize: true, printBackground: true }));
    console.log(`${out}  ${String(samples.length)} page(s)`);
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  const [out, ...samples] = process.argv.slice(2);
  if (out === undefined || samples.length === 0)
    throw new Error('usage: render-pdf-fixture.ts <out.pdf> <sample>...');
  await main(out, samples);
}
