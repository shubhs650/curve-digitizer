import type { Fit, Graph } from '@cd/core';
import { fitPathPx } from '../fit/fitInputs';
import { HitIndex } from './hitIndex';
import { toScreen, type Vec2, type ViewTransform } from './viewTransform';
import type { Reference } from '../reference/referenceStore';

/** A digitized point as the overlay sees it. */
export interface OverlayPoint {
  /** Unique within the graph: `${datasetId}/${pointId}`. */
  readonly key: string;
  readonly datasetId: string;
  readonly pointId: string;
  readonly px: Vec2;
  readonly color: string;
}

/** A fit curve in image px (task 3.2): accepted fits solid, the fit panel's preview dashed. */
export interface OverlayCurve {
  readonly key: string;
  readonly px: readonly Vec2[];
  readonly color: string;
  readonly preview: boolean;
}

/** Everything the overlay draws for one graph, derived from the project; rebuilt when the graph changes. */
export interface OverlayModel {
  readonly points: readonly OverlayPoint[];
  readonly hits: HitIndex<OverlayPoint>;
  readonly curves: readonly OverlayCurve[];
}

type CurveFit = Pick<Fit, 'model' | 'params' | 'space' | 'domain'>;

export function overlayModel(
  graph: Graph,
  preview: { readonly datasetId: string; readonly fit: CurveFit } | null = null,
): OverlayModel {
  const color = (datasetId: string) => graph.datasets.find((d) => d.id === datasetId)?.color ?? '#000000';
  const curves: OverlayCurve[] = graph.fits
    .filter((f) => preview?.datasetId !== f.datasetId)
    .map((f) => ({ key: f.id, px: fitPathPx(graph, f), color: color(f.datasetId), preview: false }));
  if (preview !== null) {
    curves.push({
      key: 'preview',
      px: fitPathPx(graph, preview.fit),
      color: color(preview.datasetId),
      preview: true,
    });
  }
  const points = graph.datasets.flatMap((d) =>
    d.points.map((p) => ({
      key: `${d.id}/${p.id}`,
      datasetId: d.id,
      pointId: p.id,
      px: p.px,
      color: d.color,
    })),
  );
  return { points, hits: new HitIndex(points), curves };
}

/** What changes the overlay's look without changing the project. */
export interface OverlayState {
  readonly hovered: string | null;
  readonly selected: ReadonlySet<string>;
}

/** Point marker radius in CSS px; hit-testing uses a slightly larger radius so markers are easy to grab. */
export const POINT_RADIUS = 4;
export const HIT_RADIUS = 7;

/** Draws onto a context whose transform maps CSS px to device px. */
export function paintOverlay(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  model: OverlayModel,
  state: OverlayState,
): void {
  // Curves under the points, with a white casing so a fit stays visible over the curve it was fitted to.
  for (const curve of model.curves) {
    if (curve.px.length < 2) continue;
    ctx.beginPath();
    curve.px.forEach((p, i) => {
      const [x, y] = toScreen(view, p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.setLineDash(curve.preview ? [6, 4] : []);
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = curve.color;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  for (const point of model.points) {
    const [x, y] = toScreen(view, point.px);
    const emphasised = point.key === state.hovered || state.selected.has(point.key);
    ctx.beginPath();
    ctx.arc(x, y, POINT_RADIUS, 0, 2 * Math.PI);
    ctx.fillStyle = point.color;
    ctx.fill();
    // A light then a dark ring keeps markers visible on white and on black chart backgrounds.
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, POINT_RADIUS + 1.5, 0, 2 * Math.PI);
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#000000';
    ctx.stroke();
    if (emphasised) {
      ctx.beginPath();
      ctx.arc(x, y, HIT_RADIUS + 1, 0, 2 * Math.PI);
      ctx.lineWidth = 2;
      ctx.strokeStyle = state.selected.has(point.key) ? '#0f6cbd' : point.color;
      ctx.stroke();
    }
  }
}

/**
 * The reference overlay (task 3.6) over the graph image: its pixels sit on the graph's at `offsetPx`, scaled
 * with the view, at the chosen opacity.
 */
export function paintReference(
  ctx: CanvasRenderingContext2D,
  view: ViewTransform,
  reference: Pick<Reference, 'bitmap' | 'opacity' | 'offsetPx'>,
): void {
  const { bitmap, opacity, offsetPx } = reference;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(
    bitmap,
    view.offset[0] + offsetPx[0] * view.scale,
    view.offset[1] + offsetPx[1] * view.scale,
    bitmap.width * view.scale,
    bitmap.height * view.scale,
  );
  ctx.restore();
}
