// Types and validating parsers for samples/<name>/ground-truth.json and ops.json (written by
// scripts/gen-samples.py). Errors carry the JSON path of the first problem, like @cd/core's parseProject.
import type { Mat3, Vec2 } from './geometry.ts';

export class SampleFormatError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'SampleFormatError';
    this.path = path;
  }
}

export type AxisType = 'linear' | 'log10';

export interface TruthAxis {
  readonly type: AxisType;
  readonly label: string;
  readonly unit?: string;
  /** Data values at the plot edges. */
  readonly min: number;
  readonly max: number;
}

export interface TruthTick {
  readonly axis: 'x' | 'y';
  readonly value: number;
  /** Where the tick meets its axis line (the other coordinate is that axis's minimum). */
  readonly px: Vec2;
}

export interface TruthSample {
  readonly value: Vec2;
  readonly px: Vec2;
}

export interface TruthDataset {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly lineWidthPx: number;
  /** SVG stroke-dasharray, starting at the first centerline vertex; null for a solid line. */
  readonly dash: readonly number[] | null;
  readonly mode: 'function';
  readonly xUnit: string;
  readonly yUnit: string;
  readonly param?: { readonly name: string; readonly value: number; readonly unit: string };
  readonly model: {
    readonly family: string;
    readonly expression: string;
    readonly params: Readonly<Record<string, number | readonly number[]>>;
  };
  readonly domain: Vec2;
  /** Exact points at round X values (X-step targets). */
  readonly samples: readonly TruthSample[];
  /** The drawn stroke's centreline, ≤ 1.5 px between vertices. */
  readonly centerline: readonly Vec2[];
}

export interface TruthIntersection {
  readonly datasets: readonly [string, string];
  readonly px: Vec2;
  readonly value: Vec2;
  readonly angleDeg: number;
}

export interface GroundTruth {
  readonly groundTruthVersion: 1;
  readonly sample: string;
  readonly description: string;
  readonly generator: string;
  readonly pixelConvention: string;
  readonly image: { readonly path: string; readonly width: number; readonly height: number };
  readonly axes: { readonly x: TruthAxis; readonly y: TruthAxis };
  /** Axis space (log10 of the value on log axes) to image px, and its inverse. */
  readonly axisToPx: Mat3;
  readonly pxToAxis: Mat3;
  readonly ticks: readonly TruthTick[];
  readonly datasets: readonly TruthDataset[];
  readonly intersections: readonly TruthIntersection[];
}

/** Acceptance targets (docs/ACCEPTANCE_TARGETS.md) that an op may feed. */
export const TARGET_IDS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'] as const;
export type TargetId = (typeof TARGET_IDS)[number];

export const OP_KINDS = ['calibrate', 'manualPick', 'trace', 'colourMask', 'xStep'] as const;
export type OpKind = (typeof OP_KINDS)[number];

interface OpBase {
  readonly id: string;
  readonly targets: readonly TargetId[];
}

/** Four calibration clicks with the data values the user types (not axis space). */
export interface CalibrateOp extends OpBase {
  readonly kind: 'calibrate';
  readonly model: 'affine' | 'projective';
  readonly points: readonly { readonly px: Vec2; readonly value: Vec2 }[];
}

/** Clicks near a curve with magnetic snap on; one point per click is expected. */
export interface ManualPickOp extends OpBase {
  readonly kind: 'manualPick';
  readonly datasetId: string;
  readonly snap: boolean;
  readonly clicks: readonly Vec2[];
}

/** Guided trace from a start pick to an end pick. */
export interface TraceOp extends OpBase {
  readonly kind: 'trace';
  readonly datasetId: string;
  readonly start: Vec2;
  readonly end: Vec2;
}

/** Colour-mask trace seeded by an eyedropper pick on the curve. */
export interface ColourMaskOp extends OpBase {
  readonly kind: 'colourMask';
  readonly datasetId: string;
  readonly pick: Vec2;
}

/** X-step sampling of the curve through `start` at the data X values `xs` (needs the sample's calibration). */
export interface XStepOp extends OpBase {
  readonly kind: 'xStep';
  readonly datasetId: string;
  readonly start: Vec2;
  readonly xs: readonly number[];
}

export type Op = CalibrateOp | ManualPickOp | TraceOp | ColourMaskOp | XStepOp;

export interface Ops {
  readonly opsVersion: 1;
  readonly sample: string;
  readonly ops: readonly Op[];
}

type Obj = Readonly<Record<string, unknown>>;

function obj(v: unknown, path: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SampleFormatError(path, 'expected an object');
  return v as Obj;
}

function arr(v: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(v)) throw new SampleFormatError(path, 'expected an array');
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string') throw new SampleFormatError(path, 'expected a string');
  return v;
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new SampleFormatError(path, 'expected a finite number');
  return v;
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') throw new SampleFormatError(path, 'expected a boolean');
  return v;
}

function oneOf<T extends string>(v: unknown, options: readonly T[], path: string): T {
  if (typeof v !== 'string' || !(options as readonly string[]).includes(v)) {
    throw new SampleFormatError(path, `expected one of ${options.join(', ')}`);
  }
  return v as T;
}

function vec2(v: unknown, path: string): Vec2 {
  const a = arr(v, path);
  if (a.length !== 2) throw new SampleFormatError(path, 'expected [x, y]');
  return [num(a[0], `${path}[0]`), num(a[1], `${path}[1]`)];
}

function mat3(v: unknown, path: string): Mat3 {
  const a = arr(v, path);
  if (a.length !== 9) throw new SampleFormatError(path, 'expected 9 numbers');
  const m = a.map((x, i) => num(x, `${path}[${String(i)}]`));
  return [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0, m[3] ?? 0, m[4] ?? 0, m[5] ?? 0, m[6] ?? 0, m[7] ?? 0, m[8] ?? 0];
}

function list<T>(v: unknown, path: string, item: (x: unknown, p: string) => T): T[] {
  return arr(v, path).map((x, i) => item(x, `${path}[${String(i)}]`));
}

function version(v: unknown, path: string): 1 {
  if (v !== 1) throw new SampleFormatError(path, `unsupported version ${String(v)}`);
  return 1;
}

function axis(v: unknown, path: string): TruthAxis {
  const o = obj(v, path);
  const base = {
    type: oneOf(o['type'], ['linear', 'log10'], `${path}.type`),
    label: str(o['label'], `${path}.label`),
    min: num(o['min'], `${path}.min`),
    max: num(o['max'], `${path}.max`),
  };
  return o['unit'] === undefined ? base : { ...base, unit: str(o['unit'], `${path}.unit`) };
}

function dataset(v: unknown, path: string): TruthDataset {
  const o = obj(v, path);
  const model = obj(o['model'], `${path}.model`);
  const params = obj(model['params'], `${path}.model.params`);
  const base: TruthDataset = {
    id: str(o['id'], `${path}.id`),
    name: str(o['name'], `${path}.name`),
    color: str(o['color'], `${path}.color`),
    lineWidthPx: num(o['lineWidthPx'], `${path}.lineWidthPx`),
    dash: o['dash'] === null ? null : list(o['dash'], `${path}.dash`, num),
    mode: oneOf(o['mode'], ['function'], `${path}.mode`),
    xUnit: str(o['xUnit'], `${path}.xUnit`),
    yUnit: str(o['yUnit'], `${path}.yUnit`),
    model: {
      family: str(model['family'], `${path}.model.family`),
      expression: str(model['expression'], `${path}.model.expression`),
      params: Object.fromEntries(
        Object.entries(params).map(([k, p]) => {
          const at = `${path}.model.params.${k}`;
          return [k, Array.isArray(p) ? list(p, at, num) : num(p, at)];
        }),
      ),
    },
    domain: vec2(o['domain'], `${path}.domain`),
    samples: list(o['samples'], `${path}.samples`, (s, p) => {
      const so = obj(s, p);
      return { value: vec2(so['value'], `${p}.value`), px: vec2(so['px'], `${p}.px`) };
    }),
    centerline: list(o['centerline'], `${path}.centerline`, vec2),
  };
  if (base.centerline.length < 2) throw new SampleFormatError(`${path}.centerline`, 'needs at least 2 points');
  if (o['param'] === undefined) return base;
  const param = obj(o['param'], `${path}.param`);
  return {
    ...base,
    param: {
      name: str(param['name'], `${path}.param.name`),
      value: num(param['value'], `${path}.param.value`),
      unit: str(param['unit'], `${path}.param.unit`),
    },
  };
}

export function parseGroundTruth(json: unknown): GroundTruth {
  const o = obj(json, '$');
  const image = obj(o['image'], '$.image');
  const axes = obj(o['axes'], '$.axes');
  const datasets = list(o['datasets'], '$.datasets', dataset);
  const ids = new Set<string>();
  datasets.forEach((d, i) => {
    if (ids.has(d.id)) throw new SampleFormatError(`$.datasets[${String(i)}].id`, `duplicate id ${d.id}`);
    ids.add(d.id);
  });
  const intersections = list(o['intersections'], '$.intersections', (v, p): TruthIntersection => {
    const c = obj(v, p);
    const pair = list(c['datasets'], `${p}.datasets`, (d, dp) => {
      const id = str(d, dp);
      if (!ids.has(id)) throw new SampleFormatError(dp, `unknown dataset ${id}`);
      return id;
    });
    if (pair.length !== 2) throw new SampleFormatError(`${p}.datasets`, 'expected two dataset ids');
    return {
      datasets: [pair[0] ?? '', pair[1] ?? ''],
      px: vec2(c['px'], `${p}.px`),
      value: vec2(c['value'], `${p}.value`),
      angleDeg: num(c['angleDeg'], `${p}.angleDeg`),
    };
  });
  return {
    groundTruthVersion: version(o['groundTruthVersion'], '$.groundTruthVersion'),
    sample: str(o['sample'], '$.sample'),
    description: str(o['description'], '$.description'),
    generator: str(o['generator'], '$.generator'),
    pixelConvention: str(o['pixelConvention'], '$.pixelConvention'),
    image: {
      path: str(image['path'], '$.image.path'),
      width: num(image['width'], '$.image.width'),
      height: num(image['height'], '$.image.height'),
    },
    axes: { x: axis(axes['x'], '$.axes.x'), y: axis(axes['y'], '$.axes.y') },
    axisToPx: mat3(o['axisToPx'], '$.axisToPx'),
    pxToAxis: mat3(o['pxToAxis'], '$.pxToAxis'),
    ticks: list(o['ticks'], '$.ticks', (v, p) => {
      const t = obj(v, p);
      return {
        axis: oneOf(t['axis'], ['x', 'y'], `${p}.axis`),
        value: num(t['value'], `${p}.value`),
        px: vec2(t['px'], `${p}.px`),
      };
    }),
    datasets,
    intersections,
  };
}

function op(v: unknown, path: string): Op {
  const o = obj(v, path);
  const base = {
    id: str(o['id'], `${path}.id`),
    targets: list(o['targets'], `${path}.targets`, (t, p) => oneOf(t, TARGET_IDS, p)),
  };
  const kind = oneOf(o['kind'], OP_KINDS, `${path}.kind`);
  switch (kind) {
    case 'calibrate':
      return {
        ...base,
        kind,
        model: oneOf(o['model'], ['affine', 'projective'], `${path}.model`),
        points: list(o['points'], `${path}.points`, (p, pp) => {
          const po = obj(p, pp);
          return { px: vec2(po['px'], `${pp}.px`), value: vec2(po['value'], `${pp}.value`) };
        }),
      };
    case 'manualPick':
      return {
        ...base,
        kind,
        datasetId: str(o['datasetId'], `${path}.datasetId`),
        snap: bool(o['snap'], `${path}.snap`),
        clicks: list(o['clicks'], `${path}.clicks`, vec2),
      };
    case 'trace':
      return {
        ...base,
        kind,
        datasetId: str(o['datasetId'], `${path}.datasetId`),
        start: vec2(o['start'], `${path}.start`),
        end: vec2(o['end'], `${path}.end`),
      };
    case 'colourMask':
      return {
        ...base,
        kind,
        datasetId: str(o['datasetId'], `${path}.datasetId`),
        pick: vec2(o['pick'], `${path}.pick`),
      };
    case 'xStep':
      return {
        ...base,
        kind,
        datasetId: str(o['datasetId'], `${path}.datasetId`),
        start: vec2(o['start'], `${path}.start`),
        xs: list(o['xs'], `${path}.xs`, num),
      };
  }
}

export function parseOps(json: unknown): Ops {
  const o = obj(json, '$');
  return {
    opsVersion: version(o['opsVersion'], '$.opsVersion'),
    sample: str(o['sample'], '$.sample'),
    ops: list(o['ops'], '$.ops', op),
  };
}

/** Positions an op clicks on, for bounds checking. */
function opPositions(o: Op): readonly Vec2[] {
  switch (o.kind) {
    case 'calibrate':
      return o.points.map((p) => p.px);
    case 'manualPick':
      return o.clicks;
    case 'trace':
      return [o.start, o.end];
    case 'colourMask':
      return [o.pick];
    case 'xStep':
      return [o.start];
  }
}

/** Checks that ops belong to this sample, name its datasets, click inside the image and step at sampled X values. */
export function checkOps(ops: Ops, truth: GroundTruth): void {
  if (ops.sample !== truth.sample) {
    throw new SampleFormatError('$.sample', `sample ${ops.sample} does not match ${truth.sample}`);
  }
  const { width, height } = truth.image;
  const seen = new Set<string>();
  for (const o of ops.ops) {
    if (seen.has(o.id)) throw new SampleFormatError('$.ops', `duplicate op id ${o.id}`);
    seen.add(o.id);
    for (const p of opPositions(o)) {
      if (!(p[0] >= 0 && p[0] <= width && p[1] >= 0 && p[1] <= height)) {
        throw new SampleFormatError(
          '$.ops',
          `${o.id}: [${String(p[0])}, ${String(p[1])}] is outside the ${String(width)} × ${String(height)} image`,
        );
      }
    }
    if (o.kind === 'calibrate') continue;
    const ds = truth.datasets.find((d) => d.id === o.datasetId);
    if (!ds) throw new SampleFormatError('$.ops', `${o.id}: unknown dataset ${o.datasetId}`);
    if (o.kind === 'xStep') {
      for (const x of o.xs) {
        if (!ds.samples.some((s) => s.value[0] === x)) {
          throw new SampleFormatError('$.ops', `${o.id}: X ${String(x)} is not a ground-truth sample of ${ds.id}`);
        }
      }
    }
  }
}
