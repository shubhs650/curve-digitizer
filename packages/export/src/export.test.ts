import type { Project } from '@cd/core';
import { evaluateFit } from '@cd/fit';
import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { csvField, csvLong, csvWide } from './csv.ts';
import { EXPORT_INFO, EXPORT_PROJECT } from './test/fixture.ts';
import { ExportError, exportDatasets } from './values.ts';
import { projectWorkbook, projectWorkbookParts } from './workbook.ts';
import { columnName, sheetName, sheetRef, xlsxParts, xmlText } from './xlsx.ts';

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
      'xl/worksheets/_rels/sheet1.xml.rels',
      'xl/drawings/drawing1.xml',
      'xl/drawings/_rels/drawing1.xml.rels',
      'xl/charts/chart1.xml',
      'xl/worksheets/sheet2.xml',
      'xl/worksheets/_rels/sheet2.xml.rels',
      'xl/drawings/drawing2.xml',
      'xl/drawings/_rels/drawing2.xml.rels',
      'xl/charts/chart2.xml',
      'xl/worksheets/sheet3.xml',
      'xl/worksheets/sheet4.xml',
      'xl/worksheets/sheet5.xml',
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

describe('XLSX v2: fits, chart, image (task 3.4)', () => {
  const parts = projectWorkbookParts(EXPORT_PROJECT, EXPORT_INFO);
  const cells = (xml: string | undefined) =>
    new Map([...(xml ?? '').matchAll(/<c r="([A-Z]+\d+)"[^>]*>(.*?)<\/c>/g)].map((m) => [m[1], m[2] ?? '']));
  const fit = cells(parts['xl/worksheets/sheet3.xml']);
  const value = (ref: string) => Number(/<v>([^<]*)<\/v>/.exec(fit.get(ref) ?? '')?.[1]);

  it('names each fit parameter range, pointing at the cells that hold it', () => {
    const names: Record<string, string> = {};
    for (const m of (parts['xl/workbook.xml'] ?? '').matchAll(/<definedName name="([^"]+)">([^<]+)</g)) {
      names[m[1] ?? ''] = m[2] ?? '';
    }
    expect(names).toEqual({
      n_1450_rpm_c: "'Fit'!$A$12:$A$14",
      decay_knots: "'Fit'!$A$76:$A$78",
      decay_values: "'Fit'!$B$76:$B$78",
      decay_slopes: "'Fit'!$C$76:$C$78",
    });
    expect([value('A12'), value('A13'), value('A14')]).toEqual([52, -0.1, -0.003]);
    expect([value('A76'), value('B76'), value('A78'), value('B78')]).toEqual([2, 60, 3, 40]);
    expect(parts['xl/workbook.xml']).toContain('<calcPr calcId="191029" fullCalcOnLoad="1"/>');
  });

  it('evaluates each fit with a live formula over its range, cached with the app’s values', () => {
    const [g1fit] = g1.fits;
    const [g2fit] = g2.fits;
    if (!g1fit || !g2fit) throw new Error('fixture has fits');
    expect(fit.get('B17')).toBe(
      '<f>INDEX(n_1450_rpm_c,1)+A17*(INDEX(n_1450_rpm_c,2)+A17*INDEX(n_1450_rpm_c,3))</f><v>50.7</v>',
    );
    expect(value('A17')).toBe(10);
    expect(value('A66')).toBe(40);
    for (const row of [17, 40, 66]) {
      expect(value(`B${String(row)}`)).toBe(evaluateFit(g1fit, value(`A${String(row)}`)).y);
    }
    // Knot tables are LET, stored the way Excel stores it.
    const spline = fit.get('B81') ?? '';
    expect(spline).toMatch(/^<f>_xlfn\.LET\(_xlpm\.u,LOG10\(A81\),/);
    expect(value('A81')).toBe(100);
    expect(value('A130')).toBe(1000);
    expect(value('B81')).toBe(evaluateFit(g2fit, 100).y);
    expect(value('B105')).toBeCloseTo(evaluateFit(g2fit, value('A105')).y, 12);
  });

  it('charts each graph’s points and fits on its axes, from the cells', () => {
    const linear = parts['xl/charts/chart1.xml'] ?? '';
    expect(linear).toContain("<c:f>'Data Pump A &lt;250 mm&gt;'!$C$2:$C$4</c:f>");
    expect(linear).toContain("<c:f>'Data Pump A &lt;250 mm&gt;'!$C$5:$C$6</c:f>");
    expect(linear).toContain("<c:f>'Fit'!$B$17:$B$66</c:f>");
    expect(linear).toContain('<c:v>n = 1450, &quot;rpm&quot; (fit)</c:v>');
    expect(linear).toContain('<a:srgbClr val="0072B2"/>');
    expect(linear).not.toContain('logBase');
    const log = parts['xl/charts/chart2.xml'] ?? '';
    expect(log.match(/<c:logBase val="10"\/>/g)).toHaveLength(1);
    expect(log).toContain("<c:f>'Fit'!$A$81:$A$130</c:f>");
  });

  it('puts each fit on the VBA sheet as a function and summarises it on the Project sheet', () => {
    const vba = parts['xl/worksheets/sheet4.xml'] ?? '';
    expect(vba).toContain('Public Function n_1450_rpm(ByVal x As Double) As Variant');
    expect(vba).toContain('Public Function decay(ByVal x As Double) As Variant');
    expect(vba).toContain('s="2"');
    const project = parts['xl/worksheets/sheet5.xml'] ?? '';
    expect(project).toContain('<t>Polynomial, degree 2</t>');
    expect(project).toContain('<t>n_1450_rpm_…</t>');
  });

  it('embeds the graph images, stored as they are, under each chart', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const images = new Map([[g1.image.path, png]]);
    const withImage = projectWorkbookParts(EXPORT_PROJECT, EXPORT_INFO, images);
    expect(withImage['[Content_Types].xml']).toContain('<Default Extension="png" ContentType="image/png"/>');
    expect(withImage['xl/drawings/drawing1.xml']).toContain('<a:blip r:embed="rId2"/>');
    // 2000 × 1500 px scaled to 640 px wide, 22 rows below the top of the 400 px chart.
    expect(withImage['xl/drawings/drawing1.xml']).toContain(
      `<xdr:row>22</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${String(640 * 9525)}" cy="${String(480 * 9525)}"/><xdr:pic>`,
    );
    expect(withImage['xl/drawings/_rels/drawing1.xml.rels']).toContain('Target="../media/image1.png"');
    expect(withImage['xl/drawings/drawing2.xml']).not.toContain('<xdr:pic>');
    const entries = unzipSync(projectWorkbook(EXPORT_PROJECT, EXPORT_INFO, images));
    expect(entries['xl/media/image1.png']).toEqual(png);
  });

  it('gives two datasets of one name their own names and functions', () => {
    const twice: Project = {
      ...EXPORT_PROJECT,
      graphs: [g1, { ...g1, id: 'g9', name: 'Pump A again', fits: g1.fits.map((f) => ({ ...f, id: 'f9' })) }],
    };
    const p = projectWorkbookParts(twice, EXPORT_INFO);
    expect(p['xl/workbook.xml']).toContain('<definedName name="n_1450_rpm_2_c">');
    expect(p['xl/worksheets/sheet4.xml']).toContain(
      'Public Function n_1450_rpm_2(ByVal x As Double) As Variant',
    );
  });

  it('rejects workbook names Excel would read as cells or reserves', () => {
    const sheet = [{ name: 'S', rows: [] }];
    expect(() => xlsxParts(sheet, { names: [{ name: 'AB12', ref: "'S'!$A$1" }] })).toThrow(RangeError);
    expect(() => xlsxParts(sheet, { names: [{ name: 'r', ref: "'S'!$A$1" }] })).toThrow(RangeError);
    expect(() =>
      xlsxParts(sheet, {
        names: [
          { name: 'k', ref: "'S'!$A$1" },
          { name: 'K', ref: "'S'!$A$2" },
        ],
      }),
    ).toThrow(RangeError);
    expect(sheetRef("Bob's", 1, 2, 1, 4)).toBe("'Bob''s'!$B$3:$B$5");
  });
});
