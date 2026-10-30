// The project model from docs/PROJECT_SCHEMA.md (schema version 1). These types are the in-memory
// shape of `project.json`; every field here is persisted. Keep them in lockstep with the schema doc:
// any change needs a migration in ./migrations and a bump of CURRENT_SCHEMA_VERSION.

export type Vec2 = readonly [number, number];

/** x0, y0, x1, y1 in PDF points, page space, origin bottom-left. */
export type RectPt = readonly [number, number, number, number];

/** Row-major 3×3 matrix mapping crop pixels to axis space. */
export type Matrix3 = readonly [number, number, number, number, number, number, number, number, number];

export type Rotation = 0 | 90 | 180 | 270;

export interface AppInfo {
  readonly name: 'curve-digitizer';
  readonly version: string;
}

export interface Settings {
  readonly units: string;
  readonly defaultDpi: number;
  readonly snapRadiusPx: number;
}

/** A source document the project's graphs were cropped from. */
export interface SourceFile {
  readonly id: string;
  readonly kind: 'pdf';
  readonly fileName: string;
  /** SHA-256 of the file bytes, lowercase hex; used to re-attach the PDF when it is not embedded. */
  readonly sha256: string;
  readonly pageCount: number;
  readonly embedded: boolean;
}

export interface ImageSource {
  readonly kind: 'image';
  readonly fileName?: string;
}

export interface PdfCropSource {
  readonly kind: 'pdfCrop';
  readonly sourceId: string;
  /** 0-based. */
  readonly pageIndex: number;
  readonly rectPt: RectPt;
  readonly dpi: number;
  readonly rotation: Rotation;
}

export type GraphSource = ImageSource | PdfCropSource;

export interface ImageRef {
  /** Path inside the `.cdz`, e.g. `graphs/g1/original.png`. */
  readonly path: string;
  readonly width: number;
  readonly height: number;
}

/**
 * One step of the non-destructive processing stack. Op names are a closed set owned by
 * packages/image; core keeps unknown ops intact so a newer file still round-trips.
 */
export interface FilterStep {
  readonly op: string;
  readonly [param: string]: unknown;
}

export type AxisType = 'linear' | 'log10';

export interface Axis {
  readonly type: AxisType;
  readonly label: string;
  readonly unit?: string;
}

export interface CalibrationPoint {
  readonly px: Vec2;
  /** Value in axis space: log10(value) on log axes. */
  readonly axis: Vec2;
}

export type CalibrationModel = 'affine' | 'projective';

export interface Calibration {
  readonly xAxis: Axis;
  readonly yAxis: Axis;
  readonly model: CalibrationModel;
  readonly points: readonly CalibrationPoint[];
  readonly matrix: Matrix3;
  readonly residualPx: number;
  readonly resolution: { readonly xUnitsPerPx: number; readonly yUnitsPerPx: number };
  readonly warnings: readonly string[];
}

export type PointOrigin = 'manual' | 'trace' | 'xstep' | 'snap';

export interface Point {
  readonly id: string;
  /** Crop pixel space at `source.dpi` after rotation; the source of truth. */
  readonly px: Vec2;
  /** Cache of `px` through the calibration, in data units. */
  readonly value: Vec2;
  /** In data units. */
  readonly sigma: Vec2;
  readonly excludedFromFit: boolean;
  readonly outOfRange: boolean;
  readonly origin: PointOrigin;
  readonly lineWidthPx?: number;
}

export interface DatasetParam {
  readonly name: string;
  readonly value: number;
  readonly unit: string;
}

export type DatasetMode = 'function' | 'path';

export interface Dataset {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly mode: DatasetMode;
  readonly param?: DatasetParam;
  readonly xUnit: string;
  readonly yUnit: string;
  readonly sourceRef: string;
  readonly notes: string;
  readonly points: readonly Point[];
}

export type FitSpace = 'lin' | 'log';

export interface FitStats {
  readonly n: number;
  readonly r2: number;
  readonly rmse: number;
  readonly aicc: number;
}

export interface Fit {
  readonly id: string;
  readonly datasetId: string;
  readonly model: string;
  readonly space: { readonly x: FitSpace; readonly y: FitSpace };
  /** Keys are model-specific; spline models store knot vectors as arrays. */
  readonly params: Readonly<Record<string, number | readonly number[]>>;
  readonly domain: Vec2;
  readonly stats: FitStats;
  readonly recommended: boolean;
}

export interface View {
  readonly zoom: number;
  readonly pan: Vec2;
}

/** One figure. */
export interface Graph {
  readonly id: string;
  readonly name: string;
  readonly source: GraphSource;
  readonly image: ImageRef;
  readonly processing: readonly FilterStep[];
  readonly calibration: Calibration | null;
  readonly datasets: readonly Dataset[];
  readonly fits: readonly Fit[];
  readonly view: View;
}

/** Last trace parameters, kept so the user can re-run a trace. */
export interface History {
  readonly op: string;
  readonly params: Readonly<Record<string, unknown>>;
}

export interface Project {
  readonly schemaVersion: 1;
  readonly app: AppInfo;
  readonly id: string;
  readonly name: string;
  /** ISO 8601 timestamps. */
  readonly created: string;
  readonly modified: string;
  readonly settings: Settings;
  readonly sources: readonly SourceFile[];
  readonly graphs: readonly Graph[];
  readonly history?: History;
}
