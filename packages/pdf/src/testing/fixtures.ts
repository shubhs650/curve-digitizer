// Packages that import these fixtures compile this file but not the declaration beside it.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./assets.d.ts" />
// Test fixtures, exported as `@cd/pdf/testing` for the worker tests; not part of the app bundle.
import chartUrl from '../../fixtures/chart.pdf?inline';
import noCopyUrl from '../../fixtures/chart-no-copy.pdf?inline';
import passwordUrl from '../../fixtures/chart-password.pdf?inline';

function bytes(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// See scripts/gen-pdf-fixtures.py. Page 1 vector-clean, page 2 sn-family, page 3 dark-bg with /Rotate 90.
export const CHART_PDF = bytes(chartUrl);
export const PASSWORD_PDF = bytes(passwordUrl);
export const PASSWORD = 'open-sesame';
export const OWNER_PASSWORD = 'owner-sesame';
export const NO_COPY_PDF = bytes(noCopyUrl);

/** Each sample chart is printed 720 pt wide, centred on the page (scripts/render-pdf-fixture.ts). */
export const CHART_WIDTH_PT = 720;

/** The chart's rectangle in page space for a sample image of `widthPx × heightPx`, on a page of `page` size. */
export function chartRect(
  page: { readonly width: number; readonly height: number },
  widthPx: number,
  heightPx: number,
): readonly [number, number, number, number] {
  const ptPerPx = CHART_WIDTH_PT / widthPx;
  const h = heightPx * ptPerPx;
  // The printer lays out on an 842 × 595 pt sheet from the top-left corner.
  const left = (842 - CHART_WIDTH_PT) / 2;
  const top = (595 - h) / 2;
  return [left, page.height - top - h, left + CHART_WIDTH_PT, page.height - top];
}
