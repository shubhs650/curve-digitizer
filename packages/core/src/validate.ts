import type {
  Axis,
  Calibration,
  CalibrationPoint,
  Dataset,
  DatasetParam,
  FilterStep,
  Fit,
  Graph,
  GraphSource,
  History,
  ImageRef,
  Matrix3,
  Point,
  Project,
  RectPt,
  Settings,
  SourceFile,
  Vec2,
  View,
} from './types.ts';

/** Raised when a `project.json` does not match the schema. `path` points at the offending field. */
export class ProjectFormatError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'ProjectFormatError';
    this.path = path;
  }
}

type Obj = Readonly<Record<string, unknown>>;

export function isObj(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function obj(value: unknown, path: string): Obj {
  if (!isObj(value)) throw new ProjectFormatError(path, 'expected an object');
  return value;
}

function str(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new ProjectFormatError(path, 'expected a string');
  return value;
}

function num(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ProjectFormatError(path, 'expected a finite number');
  }
  return value;
}

function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new ProjectFormatError(path, 'expected a boolean');
  return value;
}

function oneOf<T extends string | number>(value: unknown, allowed: readonly T[], path: string): T {
  const found = allowed.find((candidate) => candidate === value);
  if (found === undefined) {
    throw new ProjectFormatError(path, `expected one of ${allowed.map((a) => JSON.stringify(a)).join(', ')}`);
  }
  return found;
}

function arr<T>(value: unknown, path: string, item: (v: unknown, p: string) => T): readonly T[] {
  if (!Array.isArray(value)) throw new ProjectFormatError(path, 'expected an array');
  return value.map((v: unknown, i) => item(v, `${path}[${String(i)}]`));
}

function nums(value: unknown, path: string, length: number): readonly number[] {
  const out = arr(value, path, num);
  if (out.length !== length) throw new ProjectFormatError(path, `expected ${String(length)} numbers`);
  return out;
}

const vec2 = (v: unknown, p: string): Vec2 => nums(v, p, 2) as unknown as Vec2;

/** Copies an optional field only when present, so `exactOptionalPropertyTypes` holds on the result. */
function optional<K extends string, T>(
  source: Obj,
  key: K,
  path: string,
  read: (v: unknown, p: string) => T,
): { [P in K]?: T } {
  return source[key] === undefined
    ? {}
    : ({ [key]: read(source[key], `${path}.${key}`) } as { [P in K]?: T });
}

function settings(value: unknown, path: string): Settings {
  const o = obj(value, path);
  return {
    units: str(o.units, `${path}.units`),
    defaultDpi: num(o.defaultDpi, `${path}.defaultDpi`),
    snapRadiusPx: num(o.snapRadiusPx, `${path}.snapRadiusPx`),
  };
}

function sourceFile(value: unknown, path: string): SourceFile {
  const o = obj(value, path);
  return {
    id: str(o.id, `${path}.id`),
    kind: oneOf(o.kind, ['pdf'] as const, `${path}.kind`),
    fileName: str(o.fileName, `${path}.fileName`),
    sha256: str(o.sha256, `${path}.sha256`),
    pageCount: num(o.pageCount, `${path}.pageCount`),
    embedded: bool(o.embedded, `${path}.embedded`),
  };
}

function graphSource(value: unknown, path: string): GraphSource {
  const o = obj(value, path);
  const kind = oneOf(o.kind, ['image', 'pdfCrop'] as const, `${path}.kind`);
  if (kind === 'image') return { kind, ...optional(o, 'fileName', path, str) };
  return {
    kind,
    sourceId: str(o.sourceId, `${path}.sourceId`),
    pageIndex: num(o.pageIndex, `${path}.pageIndex`),
    rectPt: nums(o.rectPt, `${path}.rectPt`, 4) as unknown as RectPt,
    dpi: num(o.dpi, `${path}.dpi`),
    rotation: oneOf(o.rotation, [0, 90, 180, 270] as const, `${path}.rotation`),
  };
}

function imageRef(value: unknown, path: string): ImageRef {
  const o = obj(value, path);
  return {
    path: str(o.path, `${path}.path`),
    width: num(o.width, `${path}.width`),
    height: num(o.height, `${path}.height`),
  };
}

function filterStep(value: unknown, path: string): FilterStep {
  const o = obj(value, path);
  return { ...o, op: str(o.op, `${path}.op`) };
}

function axis(value: unknown, path: string): Axis {
  const o = obj(value, path);
  return {
    type: oneOf(o.type, ['linear', 'log10'] as const, `${path}.type`),
    label: str(o.label, `${path}.label`),
    ...optional(o, 'unit', path, str),
  };
}

function calibrationPoint(value: unknown, path: string): CalibrationPoint {
  const o = obj(value, path);
  return { px: vec2(o.px, `${path}.px`), axis: vec2(o.axis, `${path}.axis`) };
}

function calibration(value: unknown, path: string): Calibration | null {
  if (value === null) return null;
  const o = obj(value, path);
  const resolution = obj(o.resolution, `${path}.resolution`);
  return {
    xAxis: axis(o.xAxis, `${path}.xAxis`),
    yAxis: axis(o.yAxis, `${path}.yAxis`),
    model: oneOf(o.model, ['affine', 'projective'] as const, `${path}.model`),
    points: arr(o.points, `${path}.points`, calibrationPoint),
    matrix: nums(o.matrix, `${path}.matrix`, 9) as unknown as Matrix3,
    residualPx: num(o.residualPx, `${path}.residualPx`),
    resolution: {
      xUnitsPerPx: num(resolution.xUnitsPerPx, `${path}.resolution.xUnitsPerPx`),
      yUnitsPerPx: num(resolution.yUnitsPerPx, `${path}.resolution.yUnitsPerPx`),
    },
    warnings: arr(o.warnings, `${path}.warnings`, str),
  };
}

function point(value: unknown, path: string): Point {
  const o = obj(value, path);
  return {
    id: str(o.id, `${path}.id`),
    px: vec2(o.px, `${path}.px`),
    value: vec2(o.value, `${path}.value`),
    sigma: vec2(o.sigma, `${path}.sigma`),
    excludedFromFit: bool(o.excludedFromFit, `${path}.excludedFromFit`),
    outOfRange: bool(o.outOfRange, `${path}.outOfRange`),
    origin: oneOf(o.origin, ['manual', 'trace', 'xstep', 'snap'] as const, `${path}.origin`),
    ...optional(o, 'lineWidthPx', path, num),
  };
}

function datasetParam(value: unknown, path: string): DatasetParam {
  const o = obj(value, path);
  return {
    name: str(o.name, `${path}.name`),
    value: num(o.value, `${path}.value`),
    unit: str(o.unit, `${path}.unit`),
  };
}

function dataset(value: unknown, path: string): Dataset {
  const o = obj(value, path);
  return {
    id: str(o.id, `${path}.id`),
    name: str(o.name, `${path}.name`),
    color: str(o.color, `${path}.color`),
    mode: oneOf(o.mode, ['function', 'path'] as const, `${path}.mode`),
    ...optional(o, 'param', path, datasetParam),
    xUnit: str(o.xUnit, `${path}.xUnit`),
    yUnit: str(o.yUnit, `${path}.yUnit`),
    sourceRef: str(o.sourceRef, `${path}.sourceRef`),
    notes: str(o.notes, `${path}.notes`),
    points: arr(o.points, `${path}.points`, point),
  };
}

function fitParam(value: unknown, path: string): number | readonly number[] {
  return Array.isArray(value) ? arr(value, path, num) : num(value, path);
}

function fit(value: unknown, path: string): Fit {
  const o = obj(value, path);
  const space = obj(o.space, `${path}.space`);
  const params = obj(o.params, `${path}.params`);
  const stats = obj(o.stats, `${path}.stats`);
  return {
    id: str(o.id, `${path}.id`),
    datasetId: str(o.datasetId, `${path}.datasetId`),
    model: str(o.model, `${path}.model`),
    space: {
      x: oneOf(space.x, ['lin', 'log'] as const, `${path}.space.x`),
      y: oneOf(space.y, ['lin', 'log'] as const, `${path}.space.y`),
    },
    params: Object.fromEntries(
      Object.entries(params).map(([k, v]) => [k, fitParam(v, `${path}.params.${k}`)] as const),
    ),
    domain: vec2(o.domain, `${path}.domain`),
    stats: {
      n: num(stats.n, `${path}.stats.n`),
      r2: num(stats.r2, `${path}.stats.r2`),
      rmse: num(stats.rmse, `${path}.stats.rmse`),
      aicc: num(stats.aicc, `${path}.stats.aicc`),
    },
    recommended: bool(o.recommended, `${path}.recommended`),
  };
}

function view(value: unknown, path: string): View {
  const o = obj(value, path);
  return { zoom: num(o.zoom, `${path}.zoom`), pan: vec2(o.pan, `${path}.pan`) };
}

function graph(value: unknown, path: string): Graph {
  const o = obj(value, path);
  return {
    id: str(o.id, `${path}.id`),
    name: str(o.name, `${path}.name`),
    source: graphSource(o.source, `${path}.source`),
    image: imageRef(o.image, `${path}.image`),
    processing: arr(o.processing, `${path}.processing`, filterStep),
    calibration: calibration(o.calibration, `${path}.calibration`),
    datasets: arr(o.datasets, `${path}.datasets`, dataset),
    fits: arr(o.fits, `${path}.fits`, fit),
    view: view(o.view, `${path}.view`),
  };
}

function history(value: unknown, path: string): History {
  const o = obj(value, path);
  return { op: str(o.op, `${path}.op`), params: obj(o.params, `${path}.params`) };
}

function uniqueIds(items: readonly { readonly id: string }[], path: string): void {
  const seen = new Set<string>();
  items.forEach((item, i) => {
    if (seen.has(item.id))
      throw new ProjectFormatError(`${path}[${String(i)}].id`, `duplicate id "${item.id}"`);
    seen.add(item.id);
  });
}

/** Cross-references that the per-field checks cannot see. */
function checkReferences(project: Project): void {
  uniqueIds(project.sources, 'sources');
  uniqueIds(project.graphs, 'graphs');
  const sourceIds = new Set(project.sources.map((s) => s.id));
  project.graphs.forEach((g, gi) => {
    const path = `graphs[${String(gi)}]`;
    if (g.source.kind === 'pdfCrop' && !sourceIds.has(g.source.sourceId)) {
      throw new ProjectFormatError(`${path}.source.sourceId`, `unknown source "${g.source.sourceId}"`);
    }
    uniqueIds(g.datasets, `${path}.datasets`);
    uniqueIds(g.fits, `${path}.fits`);
    const datasetIds = new Set(g.datasets.map((d) => d.id));
    g.fits.forEach((f, fi) => {
      if (!datasetIds.has(f.datasetId)) {
        throw new ProjectFormatError(
          `${path}.fits[${String(fi)}].datasetId`,
          `unknown dataset "${f.datasetId}"`,
        );
      }
    });
  });
}

/**
 * Validates a current-version `project.json` value and returns it as a `Project`, dropping
 * unknown top-level and nested keys (except filter-step params). Use `migrate` for files that
 * may be older.
 */
export function parseProject(value: unknown): Project {
  const o = obj(value, '$');
  const app = obj(o.app, 'app');
  const project: Project = {
    schemaVersion: oneOf(o.schemaVersion, [1] as const, 'schemaVersion'),
    app: {
      name: oneOf(app.name, ['curve-digitizer'] as const, 'app.name'),
      version: str(app.version, 'app.version'),
    },
    id: str(o.id, 'id'),
    name: str(o.name, 'name'),
    created: str(o.created, 'created'),
    modified: str(o.modified, 'modified'),
    settings: settings(o.settings, 'settings'),
    sources: arr(o.sources, 'sources', sourceFile),
    graphs: arr(o.graphs, 'graphs', graph),
    ...(o.history === undefined ? {} : { history: history(o.history, 'history') }),
  };
  checkReferences(project);
  return project;
}
