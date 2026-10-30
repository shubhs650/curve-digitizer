import type { Graph, Project } from '@cd/core';
import { axisText, type ExportDataset, exportDatasets, paramText } from './values.ts';

/** Who wrote the file and when; passed in so exports are reproducible. */
export interface ExportInfo {
  readonly appVersion: string;
  /** ISO 8601. */
  readonly exportedAt: string;
}

/** RFC 4180 line ending; Excel and every CSV reader accept it. */
const EOL = '\r\n';

/** Quotes a field when it holds a comma, quote, newline or leading/trailing space (RFC 4180). */
export function csvField(value: string | number | boolean): string {
  const text = typeof value === 'number' ? numberText(value) : String(value);
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Shortest text that reads back as the same double, so nothing is lost to rounding. */
function numberText(value: number): string {
  return Number.isFinite(value) ? String(value) : '';
}

const row = (fields: readonly (string | number | boolean)[]): string => fields.map(csvField).join(',');

/** Comment lines starting with `#`: what the numbers are and where they came from (PRD §4.10). */
function header(
  project: Project,
  graph: Graph,
  info: ExportInfo,
  datasets: readonly ExportDataset[],
): string[] {
  const calibration = graph.calibration;
  const lines = [
    `Curve Digitizer ${info.appVersion} export, ${info.exportedAt}`,
    `Project: ${project.name}`,
    `Graph: ${graph.name}`,
  ];
  if (calibration) {
    lines.push(
      `X axis: ${axisText(calibration.xAxis)} (${calibration.xAxis.type})`,
      `Y axis: ${axisText(calibration.yAxis)} (${calibration.yAxis.type})`,
      `Calibration: ${calibration.model}, residual ${String(calibration.residualPx)} px RMS`,
    );
  }
  for (const { dataset, merged } of datasets) {
    const details = [
      dataset.mode,
      paramText(dataset),
      dataset.xUnit === '' && dataset.yUnit === '' ? '' : `units x: ${dataset.xUnit}, y: ${dataset.yUnit}`,
      dataset.sourceRef === '' ? '' : `source: ${dataset.sourceRef}`,
      merged > 0 ? `${String(merged)} points with equal X averaged` : '',
    ].filter((d) => d !== '');
    lines.push(`Dataset "${dataset.name}": ${details.join('; ')}`);
  }
  lines.push(
    'sigma = standard uncertainty in data units (pixel resolution and line width through the calibration)',
  );
  return lines.map((l) => `# ${l.replaceAll(/[\r\n]+/g, ' ')}`);
}

/**
 * Long ("tidy") table, one row per point: `dataset,param,x,y,sigma_x,sigma_y,excluded_from_fit,out_of_range`.
 * `param` is the family parameter's value so curve families load straight into 2-D interpolation.
 */
export function csvLong(project: Project, graph: Graph, info: ExportInfo): string {
  const datasets = exportDatasets(graph);
  const lines = [
    ...header(project, graph, info, datasets),
    row(['dataset', 'param', 'x', 'y', 'sigma_x', 'sigma_y', 'excluded_from_fit', 'out_of_range']),
  ];
  for (const { dataset, points } of datasets) {
    for (const p of points) {
      lines.push(
        row([
          dataset.name,
          dataset.param?.value ?? '',
          p.x,
          p.y,
          p.sigmaX,
          p.sigmaY,
          p.excludedFromFit,
          p.outOfRange,
        ]),
      );
    }
  }
  return lines.join(EOL) + EOL;
}

/**
 * Wide table: one `x` column holding every X of the function-mode datasets, then one Y column per dataset,
 * empty where that dataset has no point at that X. Values are never interpolated here; use X-step sampling
 * for a shared grid. Path datasets are not functions of X and are left out (listed in the header).
 */
export function csvWide(project: Project, graph: Graph, info: ExportInfo): string {
  const all = exportDatasets(graph);
  const datasets = all.filter((d) => d.dataset.mode === 'function');
  const xs = [...new Set(datasets.flatMap((d) => d.points.map((p) => p.x)))].sort((a, b) => a - b);
  const lookup = datasets.map((d) => new Map(d.points.map((p) => [p.x, p.y])));
  const lines = header(project, graph, info, all);
  const skipped = all.filter((d) => d.dataset.mode === 'path').map((d) => d.dataset.name);
  if (skipped.length > 0) lines.push(`# Path datasets not in this table: ${skipped.join(', ')}`);
  lines.push(row(['x', ...datasets.map((d) => d.dataset.name)]));
  for (const x of xs) lines.push(row([x, ...lookup.map((m) => m.get(x) ?? '')]));
  return lines.join(EOL) + EOL;
}
