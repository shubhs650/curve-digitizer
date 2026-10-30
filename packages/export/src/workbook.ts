import type { Graph, Project } from '@cd/core';
import type { ExportInfo } from './csv.ts';
import { axisText, exportDatasets, paramText } from './values.ts';
import { type Cell, sheetName, type SheetSpec, writeXlsx, xlsxParts } from './xlsx.ts';

const DATA_HEADER = ['dataset', 'param', 'x', 'y', 'sigma_x', 'sigma_y', 'excluded_from_fit', 'out_of_range'];

function sourceText(graph: Graph): string {
  const s = graph.source;
  if (s.kind === 'image') return `Image ${s.fileName ?? ''}`.trim();
  return `PDF ${s.sourceId}, page ${String(s.pageIndex + 1)}, ${String(s.dpi)} DPI, rotation ${String(s.rotation)}°, rect [${s.rectPt.join(', ')}] pt`;
}

function dataSheet(graph: Graph, name: string): SheetSpec {
  const rows: Cell[][] = [DATA_HEADER];
  for (const { dataset, points } of exportDatasets(graph)) {
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
  return { name, rows, headerRows: 1, widths: [24, 10, 14, 14, 14, 14, 16, 12] };
}

/** Key/value blocks describing every graph: source, calibration, datasets (the provenance at a glance). */
function projectSheet(
  project: Project,
  info: ExportInfo,
  dataSheets: ReadonlyMap<string, string>,
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
  }
  return { name: 'Project', rows, widths: [36, 24, 18, 14, 14, 10, 30, 30] };
}

function sheets(project: Project, info: ExportInfo): SheetSpec[] {
  const taken = new Set(['Project']);
  const data: SheetSpec[] = [];
  const names = new Map<string, string>();
  for (const graph of project.graphs) {
    if (!graph.calibration) continue;
    const wanted = project.graphs.length === 1 ? 'Data' : `Data ${graph.name}`;
    const name = sheetName(wanted, taken);
    taken.add(name);
    names.set(graph.id, name);
    data.push(dataSheet(graph, name));
  }
  return [...data, projectSheet(project, info, names)];
}

/** M1 workbook (task 1.9): one `Data` sheet per calibrated graph in long format, then a `Project` sheet. */
export function projectWorkbook(project: Project, info: ExportInfo): Uint8Array {
  return writeXlsx(sheets(project, info), new Date(info.exportedAt));
}

/** The workbook's XML parts, for golden-file tests. */
export function projectWorkbookParts(project: Project, info: ExportInfo): Record<string, string> {
  return xlsxParts(sheets(project, info));
}
