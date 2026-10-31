import { colorDistance, deltaE, type Mask, type Raster, type Rgb, rgbToLab, thin } from '@cd/image';
import {
  MIN_CURVE_CONTRAST,
  NoCurveError,
  type PathNode,
  samplePoints,
  type TraceHooks,
  type TracePoint,
} from './guided.ts';
import { paperColor } from './ink.ts';
import type { Vec2 } from './snap.ts';

// Colour-mask tracing (ARCHITECTURE §8.2). Every pixel within a ΔE*ab tolerance of the curve colour goes into
// a mask; a morphological open drops specks; Zhang–Suen thinning leaves a one-pixel skeleton; each connected
// piece is ordered along its longest geodesic path (which also drops the skeleton's spurs). Pieces whose ends
// line up across a short gap (another curve drawn on top, a dash gap) are joined into one component, and the
// user then picks which components to keep.

/** Default tolerance: this share of the curve–paper colour distance, clamped, in ΔE*ab. */
const TOLERANCE_SHARE = 0.5;
const MIN_TOLERANCE = 10;
const MAX_TOLERANCE = 50;
/** The open is skipped when it would remove more than this share of the mask (strokes 1–2 px wide). */
const OPEN_MAX_LOSS = 0.5;
/** Pieces shorter than this are not joined (thinning debris), px. */
const MIN_PIECE_PX = 3;
/** Arc length over which a piece's end direction is measured, px. */
const END_TANGENT_PX = 8;
/** The gap between two joined ends must point along both end directions within this angle. */
const JOIN_MAX_DEG = 35;
/** Ends closer than this are joined whatever their directions, px. */
const JOIN_ANY_PX = 2;
/** Half-width of the moving average that smooths the skeleton's pixel staircase, in path pixels. */
const SMOOTH_HALF = 2;

export interface ColourMaskOptions {
  /** The curve's colour (the eyedropper colour). */
  readonly color: Rgb;
  /** Colour distance (ΔE*ab) still counted as the curve; default from the curve–paper contrast. */
  readonly tolerance?: number;
  /** Components shorter than this are dropped, px. */
  readonly minLengthPx?: number;
  /** Longest gap bridged when joining pieces, px. */
  readonly maxGapPx?: number;
  /** Spacing of each component's output points, px (the density setting). */
  readonly spacingPx?: number;
}

export interface MaskComponent {
  /** The ordered centreline: skeleton pixel centres, smoothed; joined pieces follow each other. */
  readonly path: readonly Vec2[];
  /** Output points: Douglas–Peucker vertices (0.5 px) plus points every `spacingPx`. */
  readonly points: readonly TracePoint[];
  /** Centreline length including bridged gaps, px. */
  readonly lengthPx: number;
  /** Mean stroke width: mask area over centreline length, px. */
  readonly lineWidthPx: number;
}

export interface ColourMaskResult {
  readonly color: Rgb;
  readonly tolerance: number;
  /** Longest first. */
  readonly components: readonly MaskComponent[];
}

/** The tolerance used when none is given. */
export function defaultMaskTolerance(color: Rgb, paper: Rgb): number {
  const contrast = deltaE(rgbToLab(...color), rgbToLab(...paper));
  return Math.min(MAX_TOLERANCE, Math.max(MIN_TOLERANCE, TOLERANCE_SHARE * contrast));
}

/**
 * Morphological open (erode, then dilate) with the 3 × 3 cross: removes isolated pixels and lines one pixel
 * thin. The cross rather than the square keeps diagonal strokes 3 px wide, which a 3 × 3 square does not fit.
 */
export function openMask(mask: Mask): Mask {
  const { width, height, data } = mask;
  const at = (src: Uint8Array, x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : (src[y * width + x] ?? 0);
  const eroded = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (data[i] && at(data, x - 1, y) && at(data, x + 1, y) && at(data, x, y - 1) && at(data, x, y + 1)) {
        eroded[i] = 1;
      }
    }
  }
  const out = new Uint8Array(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (
        eroded[i] ||
        at(eroded, x - 1, y) ||
        at(eroded, x + 1, y) ||
        at(eroded, x, y - 1) ||
        at(eroded, x, y + 1)
      ) {
        out[i] = 1;
      }
    }
  }
  return { width, height, data: out };
}

const count = (data: Uint8Array): number => data.reduce((s, v) => s + v, 0);

/** 8-connected component labels (1-based, 0 = background) and each label's pixel count (index 0 unused). */
function labelComponents(mask: Mask): { labels: Int32Array; areas: number[] } {
  const { width, height, data } = mask;
  const labels = new Int32Array(data.length);
  const areas = [0];
  const stack: number[] = [];
  for (let start = 0; start < data.length; start++) {
    if (!data[start] || labels[start]) continue;
    const label = areas.length;
    let area = 0;
    labels[start] = label;
    stack.push(start);
    while (stack.length > 0) {
      const i = stack.pop() as number;
      area++;
      const x = i % width;
      const y = (i - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const j = ny * width + nx;
          if (data[j] && !labels[j]) {
            labels[j] = label;
            stack.push(j);
          }
        }
      }
    }
    areas.push(area);
  }
  return { labels, areas };
}

/** Binary min-heap of [cost, node]. */
class Heap {
  private readonly items: [number, number][] = [];
  get size(): number {
    return this.items.length;
  }
  push(cost: number, node: number): void {
    const items = this.items;
    items.push([cost, node]);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((items[parent] as [number, number])[0] <= cost) break;
      [items[i], items[parent]] = [items[parent] as [number, number], items[i] as [number, number]];
      i = parent;
    }
  }
  pop(): [number, number] {
    const items = this.items;
    const top = items[0] as [number, number];
    const last = items.pop() as [number, number];
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && (items[l] as [number, number])[0] < (items[m] as [number, number])[0]) m = l;
        if (r < items.length && (items[r] as [number, number])[0] < (items[m] as [number, number])[0]) m = r;
        if (m === i) break;
        [items[i], items[m]] = [items[m] as [number, number], items[i] as [number, number]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * The longest geodesic path through a skeleton piece (8-connected, diagonal steps √2): Dijkstra from any
 * pixel to the farthest one, then again from there; exact on a tree, which a thinned stroke almost is.
 */
function longestPath(pixels: readonly number[], width: number): { path: Vec2[]; length: number } {
  const local = new Map<number, number>();
  pixels.forEach((p, k) => local.set(p, k));
  const neighbours = (k: number): [number, number][] => {
    const p = pixels[k] as number;
    const x = p % width;
    const out: [number, number][] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx === 0 && dy === 0) || x + dx < 0 || x + dx >= width) continue;
        const j = local.get(p + dy * width + dx);
        if (j !== undefined) out.push([j, dx !== 0 && dy !== 0 ? Math.SQRT2 : 1]);
      }
    }
    return out;
  };
  const farthest = (from: number) => {
    const dist = new Float64Array(pixels.length).fill(Infinity);
    const prev = new Int32Array(pixels.length).fill(-1);
    dist[from] = 0;
    const heap = new Heap();
    heap.push(0, from);
    let far = from;
    while (heap.size > 0) {
      const [d, k] = heap.pop();
      if (d > (dist[k] ?? Infinity)) continue;
      if (d > (dist[far] ?? 0)) far = k;
      for (const [j, w] of neighbours(k)) {
        if (d + w < (dist[j] ?? Infinity)) {
          dist[j] = d + w;
          prev[j] = k;
          heap.push(d + w, j);
        }
      }
    }
    return { far, dist, prev };
  };
  const a = farthest(0).far;
  const { far: b, dist, prev } = farthest(a);
  const path: Vec2[] = [];
  for (let k = b; k >= 0; k = prev[k] ?? -1) {
    const p = pixels[k] as number;
    const x = p % width;
    path.push([x + 0.5, (p - x) / width + 0.5]);
  }
  return { path, length: dist[b] ?? 0 };
}

/** Moving average over ±SMOOTH_HALF pixels; the window shrinks at the ends so they stay put. */
function smooth(path: readonly Vec2[]): Vec2[] {
  return path.map((_, i) => {
    const h = Math.min(SMOOTH_HALF, i, path.length - 1 - i);
    let x = 0;
    let y = 0;
    for (let k = i - h; k <= i + h; k++) {
      x += (path[k] as Vec2)[0];
      y += (path[k] as Vec2)[1];
    }
    return [x / (2 * h + 1), y / (2 * h + 1)];
  });
}

interface Piece {
  readonly path: Vec2[];
  readonly length: number;
  readonly area: number;
}

/** Outward unit direction at one end of a piece (end 0 = its first point, 1 = its last). */
function endDirection(piece: Piece, end: 0 | 1): { at: Vec2; dir: Vec2 } {
  const path = end === 0 ? piece.path : [...piece.path].reverse();
  const at = path[0] as Vec2;
  let back = at;
  let arc = 0;
  for (let i = 1; i < path.length && arc < END_TANGENT_PX; i++) {
    const p = path[i] as Vec2;
    arc += Math.hypot(p[0] - back[0], p[1] - back[1]);
    back = p;
  }
  const dx = at[0] - back[0];
  const dy = at[1] - back[1];
  const n = Math.hypot(dx, dy) || 1;
  return { at, dir: [dx / n, dy / n] };
}

/** Chains of pieces joined end to end across gaps, each chain as [piece index, reversed] in order. */
function joinPieces(pieces: readonly Piece[], maxGapPx: number): [number, boolean][][] {
  const cos = Math.cos((JOIN_MAX_DEG * Math.PI) / 180);
  const ends = pieces.flatMap((p, i) =>
    [0, 1].map((e) => ({ piece: i, end: e, ...endDirection(p, e as 0 | 1) })),
  );
  const links: { a: number; b: number; gap: number }[] = [];
  for (let a = 0; a < ends.length; a++) {
    for (let b = a + 1; b < ends.length; b++) {
      const ea = ends[a] as (typeof ends)[number];
      const eb = ends[b] as (typeof ends)[number];
      if (ea.piece === eb.piece) continue;
      const dx = eb.at[0] - ea.at[0];
      const dy = eb.at[1] - ea.at[1];
      const gap = Math.hypot(dx, dy);
      if (gap > maxGapPx) continue;
      if (gap > JOIN_ANY_PX) {
        const ux = dx / gap;
        const uy = dy / gap;
        if (ea.dir[0] * ux + ea.dir[1] * uy < cos || -(eb.dir[0] * ux + eb.dir[1] * uy) < cos) continue;
      }
      links.push({ a, b, gap });
    }
  }
  links.sort((p, q) => p.gap - q.gap);
  // Union–find over pieces so no chain closes into a loop; each end takes at most one link.
  const root = pieces.map((_, i) => i);
  const find = (i: number): number => {
    while (root[i] !== i) i = root[i] = root[root[i] as number] as number;
    return i;
  };
  const partner = new Int32Array(ends.length).fill(-1);
  for (const { a, b } of links) {
    if (partner[a] !== -1 || partner[b] !== -1) continue;
    const pa = find((ends[a] as (typeof ends)[number]).piece);
    const pb = find((ends[b] as (typeof ends)[number]).piece);
    if (pa === pb) continue;
    root[pa] = pb;
    partner[a] = b;
    partner[b] = a;
  }
  // Walk each chain from a free end; end index e belongs to piece e >> 1, as its start (even) or finish (odd).
  const chains: [number, boolean][][] = [];
  const seen = new Uint8Array(pieces.length);
  for (let e = 0; e < ends.length; e++) {
    if (partner[e] !== -1 || seen[e >> 1]) continue;
    const chain: [number, boolean][] = [];
    let entry = e;
    for (;;) {
      const piece = entry >> 1;
      seen[piece] = 1;
      chain.push([piece, (entry & 1) === 1]);
      const exit = entry ^ 1;
      const next = partner[exit] ?? -1;
      if (next === -1) break;
      entry = next;
    }
    chains.push(chain);
  }
  return chains;
}

/**
 * Extracts every curve of `options.color` from the (processed) image as ordered centreline components,
 * longest first (ARCHITECTURE §8.2). The UI shows them all and keeps the ones the user picks.
 */
export async function traceColourMask(
  raster: Raster,
  options: ColourMaskOptions,
  hooks: TraceHooks = {},
): Promise<ColourMaskResult> {
  const { color } = options;
  const paper = paperColor(raster);
  if (deltaE(rgbToLab(...color), rgbToLab(...paper)) < MIN_CURVE_CONTRAST) {
    throw new NoCurveError('The picked colour is the paper colour');
  }
  const tolerance = options.tolerance ?? defaultMaskTolerance(color, paper);
  const { width, height } = raster;
  const tick = (f: number) => hooks.tick?.(f);

  const distance = colorDistance(raster, color, (row) => {
    if ((row & 15) === 0) tick((0.3 * row) / height);
  });
  const raw = new Uint8Array(width * height);
  distance.data.forEach((d, i) => {
    if (d <= tolerance) raw[i] = 1;
  });
  await hooks.checkpoint?.();
  tick(0.35);
  // Open by reconstruction: a mask component stays whole when any of it survives the open, so specks go
  // while strokes keep their thin stretches (a steep 3 px stroke can lose its core to the erosion).
  const { labels, areas } = labelComponents({ width, height, data: raw });
  tick(0.4);
  const opened = openMask({ width, height, data: raw });
  const survives = new Uint8Array(areas.length);
  opened.data.forEach((v, i) => {
    if (v) survives[labels[i] ?? 0] = 1;
  });
  const reconstructed = raw.map((v, i) => (v && survives[labels[i] ?? 0] ? 1 : 0));
  const mask = {
    width,
    height,
    data: count(reconstructed) >= (1 - OPEN_MAX_LOSS) * count(raw) ? reconstructed : raw,
  };
  await hooks.checkpoint?.();
  tick(0.45);
  // Lü–Wang, so steep stretches of a stroke are not thinned away (plain Zhang–Suen erases 45° lines 2 px thick).
  const skeleton = thin(
    mask,
    () => {
      tick(0.45);
    },
    { keepDiagonals: true },
  );
  await hooks.checkpoint?.();
  tick(0.7);

  const byLabel = new Map<number, number[]>();
  skeleton.data.forEach((v, i) => {
    if (!v) return;
    const label = labels[i] ?? 0;
    const list = byLabel.get(label);
    if (list) list.push(i);
    else byLabel.set(label, [i]);
  });
  const pieces: Piece[] = [];
  let done = 0;
  for (const [label, pixels] of byLabel) {
    tick(0.7 + (0.25 * done++) / byLabel.size);
    const { path, length } = longestPath(pixels, width);
    if (length < MIN_PIECE_PX && length < (options.minLengthPx ?? Infinity)) continue;
    pieces.push({ path: smooth(path), length, area: areas[label] ?? 0 });
  }
  await hooks.checkpoint?.();

  const spacing = options.spacingPx ?? 5;
  const minLength = options.minLengthPx ?? 20;
  const components: MaskComponent[] = [];
  for (const chain of joinPieces(pieces, options.maxGapPx ?? 16)) {
    const path: Vec2[] = [];
    let drawn = 0;
    let area = 0;
    for (const [index, reversed] of chain) {
      const piece = pieces[index] as Piece;
      path.push(...(reversed ? [...piece.path].reverse() : piece.path));
      drawn += piece.length;
      area += piece.area;
    }
    let lengthPx = 0;
    for (let i = 1; i < path.length; i++) {
      lengthPx += Math.hypot(
        (path[i] as Vec2)[0] - (path[i - 1] as Vec2)[0],
        (path[i] as Vec2)[1] - (path[i - 1] as Vec2)[1],
      );
    }
    if (lengthPx < minLength) continue;
    const lineWidthPx = area / Math.max(1, drawn);
    const nodes: PathNode[] = path.map((px) => ({ px, width: lineWidthPx }));
    components.push({ path, points: samplePoints(nodes, spacing), lengthPx, lineWidthPx });
  }
  components.sort((a, b) => b.lengthPx - a.lengthPx);
  tick(1);
  return { color, tolerance, components };
}

/** Index of the component passing nearest to `p`, or -1 when none passes within `maxDistancePx`. */
export function nearestComponent(
  components: readonly MaskComponent[],
  p: Vec2,
  maxDistancePx = Infinity,
): number {
  let best = -1;
  let bestDistance = maxDistancePx;
  components.forEach((c, i) => {
    for (const q of c.path) {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d <= bestDistance) {
        best = i;
        bestDistance = d;
      }
    }
  });
  return best;
}
