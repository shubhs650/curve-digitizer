import { describe, expect, it } from 'vitest';
import * as exporters from './index.ts';

describe('@cd/export', () => {
  it('exposes CSV, XLSX and the shared value pipeline', () => {
    expect(exporters.packageName).toBe('@cd/export');
    for (const name of ['csvLong', 'csvWide', 'projectWorkbook', 'exportDatasets', 'writeXlsx'] as const) {
      expect(typeof exporters[name]).toBe('function');
    }
  });
});
