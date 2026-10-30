import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { csvField, csvLong, csvWide } from './csv.ts';
import { EXPORT_INFO, EXPORT_PROJECT } from './test/fixture.ts';
import { ExportError, exportDatasets } from './values.ts';
import { projectWorkbook, projectWorkbookParts } from './workbook.ts';
import { columnName, sheetName, xlsxParts, xmlText } from './xlsx.ts';

// Golden files live in packages/export/fixtures/golden; regenerate with `pnpm vitest run --project export -u`
// and review the diff.

const [g1, g2, g3] = EXPORT_PROJECT.graphs;
if (!g1 || !g2 || !g3) throw new Error('fixture has three graphs');

describe('exportDatasets', () => {
  it('recomputes values from px, sorts function datasets by X and averages equal X', () => {
    const [d1, d2] = exportDatasets(g1);
    const expected = [
      [10.025, 49.975],
      [25.025, 47.475],
      [40.025, 39.475],
    ];
    expect(d1?.points).toHaveLength(3);
    d1?.points.forEach((p, i) => {
      expect(p.x).toBeCloseTo(expected[i]?.[0] ?? NaN, 9);
      expect(p.y).toBeCloseTo(expected[i]?.[1] ?? NaN, 9);
    });
    expect(d1?.merged).toBe(2);
    expect(d1?.points[0]?.excludedFromFit).toBe(true);
    expect(d1?.points[2]?.outOfRange).toBe(true);
    // Path datasets keep pick order.
    expect(d2?.points.map((p) => Math.round(p.x))).toEqual([35, 30]);
  });

  it('propagates sigma through the calibration and log axes', () => {
    const [d1] = exportDatasets(g1);
    // σ = √(0.5² + 1²) px × 0.05 units/px for the default 2 px line.
    expect(d1?.points[0]?.sigmaY).toBeCloseTo(Math.hypot(0.5, 1) * 0.05, 12);
    const [e1] = exportDatasets(g2);
    expect(e1?.points[0]?.x).toBeCloseTo(100, 9);
    expect(e1?.points[1]?.x).toBeCloseTo(1000, 9);
    expect(e1?.points[1]?.sigmaX ?? 0).toBeGreaterThan(e1?.points[0]?.sigmaX ?? Infinity);
  });

  it('refuses an uncalibrated graph', () => {
    expect(() => exportDatasets(g3)).toThrow(ExportError);
    expect(() => csvLong(EXPORT_PROJECT, g3, EXPORT_INFO)).toThrow(/not calibrated/);
  });
});

describe('CSV', () => {
  it('quotes fields per RFC 4180 and writes numbers losslessly', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField(' padded')).toBe('" padded"');
    expect(csvField(0.1 + 0.2)).toBe('0.30000000000000004');
    expect(csvField(Number.NaN)).toBe('');
    expect(csvField(true)).toBe('true');
  });

  it('matches the long golden file', async () => {
    await expect(csvLong(EXPORT_PROJECT, g1, EXPORT_INFO)).toMatchFileSnapshot('../fixtures/golden/long.csv');
  });

  it('matches the wide golden file', async () => {
    await expect(csvWide(EXPORT_PROJECT, g1, EXPORT_INFO)).toMatchFileSnapshot('../fixtures/golden/wide.csv');
  });

  it('matches the log-axis golden file', async () => {
    await expect(csvLong(EXPORT_PROJECT, g2, EXPORT_INFO)).toMatchFileSnapshot(
      '../fixtures/golden/long-log.csv',
    );
  });
});

describe('XLSX', () => {
  it('names columns and sheets the way Excel requires', () => {
    expect([0, 25, 26, 51, 52, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'AZ', 'BA', 'ZZ', 'AAA']);
    expect(sheetName('Data Fig 3/4: [a]?', new Set())).toBe('Data Fig 3-4- -a--');
    expect(sheetName('Data', new Set(['data']))).toBe('Data (2)');
    expect(sheetName('x'.repeat(40), new Set()).length).toBe(31);
    expect(sheetName("''", new Set())).toBe('Sheet');
  });

  it('escapes XML and drops characters XML cannot hold', () => {
    expect(xmlText('a<b>&"c"\u0001')).toBe('a&lt;b&gt;&amp;&quot;c&quot;');
  });

  it('rejects an empty workbook and duplicate sheet names', () => {
    expect(() => xlsxParts([])).toThrow(RangeError);
    expect(() =>
      xlsxParts([
        { name: 'A', rows: [] },
        { name: 'a', rows: [] },
      ]),
    ).toThrow(RangeError);
  });

  it('matches the workbook golden file part by part', async () => {
    const parts = projectWorkbookParts(EXPORT_PROJECT, EXPORT_INFO);
    expect(Object.keys(parts)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
      'xl/worksheets/sheet2.xml',
      'xl/worksheets/sheet3.xml',
    ]);
    expect(parts['xl/workbook.xml']).toContain('<sheet name="Data Pump A &lt;250 mm&gt;"');
    await expect(JSON.stringify(parts, null, 1)).toMatchFileSnapshot('../fixtures/golden/workbook.json');
  });

  it('zips exactly those parts, reproducibly', () => {
    const bytes = projectWorkbook(EXPORT_PROJECT, EXPORT_INFO);
    expect(projectWorkbook(EXPORT_PROJECT, EXPORT_INFO)).toEqual(bytes);
    const entries = unzipSync(bytes);
    const parts = projectWorkbookParts(EXPORT_PROJECT, EXPORT_INFO);
    expect(Object.fromEntries(Object.entries(entries).map(([k, v]) => [k, strFromU8(v)]))).toEqual(parts);
  });
});
