import type { Dataset, Fit, Graph, Project } from '@cd/core';
import { evaluateFit, generateCode, identifier, type SheetFit, sheetFit } from '@cd/fit';
import { type ChartSeries, scatterChartXml } from './chart.ts';
import type { ExportInfo } from './csv.ts';
import { axisText, exportDatasets, paramText } from './values.ts';
import {
  type Cell,
  type DefinedName,
  type SheetChart,
  type SheetImage,
  sheetName,
  sheetRef,
  type SheetSpec,
  writeXlsx,
  xlsxParts,
} from './xlsx.ts';

// The workbook (tasks 1.9 and 3.4, PRD §4.9, ADR 43): a Data sheet per calibrated graph with a chart of its
// points and fits and the graph image; a Fit sheet whose formulas read each fit's parameters from named ranges;
// a VBA sheet with the same functions as text; and a Project sheet with the provenance and fit summary.

const DATA_HEADER = ['dataset', 'param', 'x', 'y', 'sigma_x', 'sigma_y', 'excluded_from_fit', 'out_of_range'];
const X_COL = 2;
const Y_COL = 3;

/** Values each fit is evaluated at on the Fit sheet (and drawn through on the chart). */
export const FIT_ROWS = 50;

/** The chart and the image sit right of the data, from column J. */
const DRAWING_COL = 9;
const CHART_SIZE = { widthPx: 640, heightPx: 400 } as const;
/** Default row height, px: where the image starts below the chart. */
const ROW_PX = 20;
const IMAGE_MAX_PX = 640;

/** Graph images by `image.path`, for embedding. */
export type WorkbookImages = ReadonlyMap<string, Uint8Array>;

function sourceText(graph: Graph): string {
  const s = graph.source;
  if (s.kind === 'image') return `Image ${s.fileName ?? ''}`.trim();
  return `PDF ${s.sourceId}, page ${String(s.pageIndex + 1)}, ${String(s.dpi)} DPI, rotation ${String(s.rotation)}°, rect [${s.rectPt.join(', ')}] pt`;
}

/** A dataset's rows on its Data sheet, for the chart. */
interface DataRows {
  readonly dataset: Dataset;
  readonly first: number;
  readonly xs: readonly number[];
  readonly ys: readonly number[];
}

function dataSheet(graph: Graph): { readonly rows: Cell[][]; readonly datasets: DataRows[] } {
  const rows: Cell[][] = [DATA_HEADER];
  const datasets: DataRows[] = [];
  for (const { dataset, points } of exportDatasets(graph)) {
    if (points.length > 0) {
      datasets.push({ dataset, first: rows.length, xs: points.map((p) => p.x), ys: points.map((p) => p.y) });
    }
    for (const p of points) {
      rows.push([
        dataset.name,
        dataset.param?.value ?? null,
        p.x,
        p.y,
        p.sigmaX,
        p.sigmaY,
        p.excludedFromFit,
        p.outOfRange,
      ]);
    }
  }
  return { rows, datasets };
}

/** A kept fit placed on the Fit sheet. */
interface PlacedFit {
  readonly graph: Graph;
  readonly dataset: Dataset;
  readonly fit: Fit;
  /** Prefix of its workbook names and its VBA function name. */
  readonly prefix: string;
  readonly sheet: SheetFit;
  /** The evaluation table: first row (0-based) and its x and y. */
  readonly first: number;
  readonly xs: readonly number[];
  readonly ys: readonly (number | null)[];
}

/** `count` x values across the fit's domain, evenly spaced in fit space like the in-app curve. */
function fitXs(fit: Fit, count: number): number[] {
  const [from, to] = fit.domain;
  const log = fit.space.x === 'log' && from > 0 && to > 0;
  const a = log ? Math.log10(from) : from;
  const b = log ? Math.log10(to) : to;
  return Array.from({ length: count }, (_, i) => {
    // The ends exactly: 10^log10(x) can miss x by an ulp, which would read as extrapolation.
    if (i === 0) return from;
    if (i === count - 1) return to;
    const s = a + ((b - a) * i) / (count - 1);
    return log ? 10 ** s : s;
  });
}

const unitText = (unit: string) => (unit ? ` (${unit})` : '');

/** The Fit sheet: per fit, its description, its parameters as named ranges and a table of live formulas. */
function fitSheet(
  graphs: readonly Graph[],
  name: string,
): { readonly spec: SheetSpec; readonly fits: PlacedFit[]; readonly names: DefinedName[] } {
  const rows: Cell[][] = [
    ['Each fit below computes y in column B from x in column A with a formula that reads the fit parameters'],
    [
      'from their named ranges. Type another x in column A, or edit a parameter, and the values and chart follow.',
    ],
    [
      'Knot-table fits (splines, piecewise lines) use LET: Excel 2021 or Microsoft 365. Otherwise use the VBA sheet.',
    ],
  ];
  const boldRows: number[] = [];
  const fits: PlacedFit[] = [];
  const names: DefinedName[] = [];
  const taken = new Set<string>();
  for (const graph of graphs) {
    for (const fit of graph.fits) {
      const dataset = graph.datasets.find((d) => d.id === fit.datasetId);
      if (!dataset) continue;
      let prefix = identifier(dataset.name);
      for (let k = 2; taken.has(prefix); k++) prefix = `${identifier(dataset.name)}_${String(k)}`;
      taken.add(prefix);
      const sheet = sheetFit(fit, prefix, dataset.name);
      rows.push([]);
      boldRows.push(rows.length);
      rows.push([`Fit: ${dataset.name}`, `Graph: ${graph.name}`]);
      for (const line of sheet.header) rows.push([line]);
      rows.push([]);
      boldRows.push(rows.length);
      rows.push(sheet.tables.map((t) => `${t.label} [${t.name}]`));
      const top = rows.length;
      const height = Math.max(...sheet.tables.map((t) => t.values.length));
      for (let r = 0; r < height; r++) rows.push(sheet.tables.map((t) => t.values[r] ?? null));
      sheet.tables.forEach((t, col) => {
        names.push({ name: t.name, ref: sheetRef(name, col, top, col, top + t.values.length - 1) });
      });
      rows.push([]);
      boldRows.push(rows.length);
      rows.push([`x${unitText(dataset.xUnit)}`, `y${unitText(dataset.yUnit)} = ${prefix}(x)`]);
      const first = rows.length;
      const xs = fitXs(fit, FIT_ROWS);
      const ys = xs.map((x) => {
        const { y } = evaluateFit(fit, x);
        return Number.isFinite(y) ? y : null;
      });
      xs.forEach((x, i) => {
        rows.push([x, { formula: sheet.formula(`A${String(first + i + 1)}`), value: ys[i] ?? null }]);
      });
      fits.push({ graph, dataset, fit, prefix, sheet, first, xs, ys });
    }
  }
  return { spec: { name, rows, boldRows, widths: [30, 30, 22, 22] }, fits, names };
}

/** The VBA sheet: every fit as a function to paste into a module (the same code as the Code dialog). */
function vbaSheet(fits: readonly PlacedFit[], name: string): SheetSpec {
  const rows: Cell[][] = [
    [
      'Paste a function into a VBA module (Alt+F11, then Insert > Module), then use it in any cell like =name(A2).',
    ],
  ];
  for (const f of fits) {
    rows.push([]);
    // The function takes the prefix's name, so two datasets with one name still get two functions.
    const code = generateCode(f.fit, 'vba', {
      datasetName: f.prefix === identifier(f.dataset.name) ? f.dataset.name : f.prefix,
    });
    for (const line of code.replace(/\n$/, '').split('\n')) rows.push([line]);
  }
  return { name, rows, headerRows: 1, mono: true, widths: [110] };
}

function chartOf(
  graph: Graph,
  dataName: string,
  data: readonly DataRows[],
  fitName: string,
  fits: readonly PlacedFit[],
): SheetChart {
  const c = graph.calibration;
  const series: ChartSeries[] = data.map((d) => ({
    name: d.dataset.name,
    color: d.dataset.color,
    kind: 'points',
    x: { ref: sheetRef(dataName, X_COL, d.first, X_COL, d.first + d.xs.length - 1), values: d.xs },
    y: { ref: sheetRef(dataName, Y_COL, d.first, Y_COL, d.first + d.ys.length - 1), values: d.ys },
  }));
  for (const f of fits) {
    const last = f.first + f.xs.length - 1;
    series.push({
      name: `${f.dataset.name} (fit)`,
      color: f.dataset.color,
      kind: 'line',
      x: { ref: sheetRef(fitName, 0, f.first, 0, last), values: f.xs },
      y: { ref: sheetRef(fitName, 1, f.first, 1, last), values: f.ys },
    });
  }
  return {
    anchor: { col: DRAWING_COL, row: 1, ...CHART_SIZE },
    name: `Chart ${graph.name}`,
    xml: scatterChartXml({
      title: graph.name,
      x: { title: c ? axisText(c.xAxis) : 'x', log: c?.xAxis.type === 'log10' },
      y: { title: c ? axisText(c.yAxis) : 'y', log: c?.yAxis.type === 'log10' },
      series,
    }),
  };
}

function imageOf(graph: Graph, png: Uint8Array): SheetImage {
  const { width, height } = graph.image;
  const scale = Math.min(1, IMAGE_MAX_PX / Math.max(1, width));
  return {
    anchor: {
      col: DRAWING_COL,
      row: 2 + Math.ceil(CHART_SIZE.heightPx / ROW_PX),
      widthPx: Math.round(width * scale),
      heightPx: Math.round(height * scale),
    },
    name: `Image ${graph.name}`,
    description: `The graph image the points were digitised from: ${sourceText(graph)}`,
    png,
  };
}

/** Key/value blocks describing every graph: source, calibration, datasets and fits (the provenance at a glance). */
function projectSheet(
  project: Project,
  info: ExportInfo,
  dataSheets: ReadonlyMap<string, string>,
  fits: readonly PlacedFit[],
): SheetSpec {
  const rows: Cell[][] = [
    ['Project', project.name],
    ['Exported', info.exportedAt],
    ['App version', info.appVersion],
    ['Project id', project.id],
  ];
  for (const graph of project.graphs) {
    const c = graph.calibration;
    rows.push(
      [],
      ['Graph', graph.name],
      ['Data sheet', dataSheets.get(graph.id) ?? 'none: graph is not calibrated'],
      ['Source', sourceText(graph)],
      ['Image', `${String(graph.image.width)} × ${String(graph.image.height)} px`],
    );
    if (c) {
      rows.push(
        ['X axis', axisText(c.xAxis), c.xAxis.type],
        ['Y axis', axisText(c.yAxis), c.yAxis.type],
        ['Calibration model', c.model],
        ['Residual (px RMS)', c.residualPx],
        ['Resolution (x units/px, y units/px)', c.resolution.xUnitsPerPx, c.resolution.yUnitsPerPx],
        ['Calibration matrix (px → axis space)', ...c.matrix],
        ['Calibration points', 'px x', 'px y', 'axis x', 'axis y'],
        ...c.points.map((p, i): Cell[] => [`  ${String(i + 1)}`, p.px[0], p.px[1], p.axis[0], p.axis[1]]),
      );
      for (const w of c.warnings) rows.push(['Warning', w]);
    }
    rows.push(['Datasets', 'mode', 'parameter', 'x unit', 'y unit', 'points', 'source reference', 'notes']);
    for (const d of graph.datasets) {
      rows.push([
        `  ${d.name}`,
        d.mode,
        paramText(d),
        d.xUnit,
        d.yUnit,
        d.points.length,
        d.sourceRef,
        d.notes,
      ]);
    }
    const graphFits = fits.filter((f) => f.graph === graph);
    if (graphFits.length > 0) {
      rows.push([
        'Fits',
        'model',
        'R²',
        'RMSE',
        'AICc',
        'fitted points',
        'valid from',
        'valid to',
        'Fit sheet names',
      ]);
      for (const f of graphFits) {
        rows.push([
          `  ${f.dataset.name}`,
          (f.sheet.header[0] ?? '').replace(/^Curve Digitizer fit: /, ''),
          f.fit.stats.r2,
          f.fit.stats.rmse,
          f.fit.stats.aicc,
          f.fit.stats.n,
          f.fit.domain[0],
          f.fit.domain[1],
          `${f.prefix}_…`,
        ]);
      }
    }
  }
  return { name: 'Project', rows, widths: [36, 24, 18, 14, 14, 10, 30, 30, 18] };
}

interface Built {
  readonly sheets: SheetSpec[];
  readonly names: DefinedName[];
}

function build(project: Project, info: ExportInfo, images: WorkbookImages): Built {
  const taken = new Set(['Project']);
  const reserve = (wanted: string) => {
    const name = sheetName(wanted, taken);
    taken.add(name);
    return name;
  };
  const calibrated = project.graphs.filter((g) => g.calibration);
  const dataNames = new Map<string, string>();
  for (const graph of calibrated) {
    dataNames.set(graph.id, reserve(project.graphs.length === 1 ? 'Data' : `Data ${graph.name}`));
  }
  const hasFits = calibrated.some((g) => g.fits.some((f) => g.datasets.some((d) => d.id === f.datasetId)));
  const fitName = hasFits ? reserve('Fit') : '';
  const vbaName = hasFits ? reserve('VBA') : '';
  const fit = hasFits ? fitSheet(calibrated, fitName) : { spec: null, fits: [], names: [] };

  const data = calibrated.map((graph): SheetSpec => {
    const name = dataNames.get(graph.id) ?? '';
    const { rows, datasets } = dataSheet(graph);
    const graphFits = fit.fits.filter((f) => f.graph === graph);
    const png = images.get(graph.image.path);
    return {
      name,
      rows,
      headerRows: 1,
      widths: [24, 10, 14, 14, 14, 14, 16, 12],
      charts: [chartOf(graph, name, datasets, fitName, graphFits)],
      images: png ? [imageOf(graph, png)] : [],
    };
  });
  return {
    sheets: [
      ...data,
      ...(fit.spec ? [fit.spec, vbaSheet(fit.fits, vbaName)] : []),
      projectSheet(project, info, dataNames, fit.fits),
    ],
    names: fit.names,
  };
}

const NO_IMAGES: WorkbookImages = new Map();

/**
 * The project workbook: Data sheets with a chart and the graph image, Fit and VBA sheets when any dataset has a
 * kept fit, and a Project sheet. Graph images missing from `images` are left out.
 */
export function projectWorkbook(
  project: Project,
  info: ExportInfo,
  images: WorkbookImages = NO_IMAGES,
): Uint8Array {
  const { sheets, names } = build(project, info, images);
  return writeXlsx(sheets, new Date(info.exportedAt), { names });
}

/** The workbook's XML parts, for golden-file tests. */
export function projectWorkbookParts(
  project: Project,
  info: ExportInfo,
  images: WorkbookImages = NO_IMAGES,
): Record<string, string> {
  const { sheets, names } = build(project, info, images);
  return xlsxParts(sheets, { names });
}
