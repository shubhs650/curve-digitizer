import { describe, expect, it } from 'vitest';
import * as pdf from './index.ts';

describe('@cd/pdf public API', () => {
  it('exports the engine, geometry and loader', () => {
    expect(Object.keys(pdf).sort()).toEqual([
      'MAX_RENDER_PIXELS',
      'PdfDocument',
      'PdfEngine',
      'PdfOpenError',
      'PdfPermissionError',
      'PdfiumLoadError',
      'applyAffine',
      'capDpi',
      'composeAffine',
      'cropPixelSize',
      'displaySize',
      'invertAffine',
      'loadPdfEngine',
      'pageToCrop',
      'pageToDisplay',
      'renderMatrix',
    ]);
  });
});
