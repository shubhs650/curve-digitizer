import type { Graph } from '@cd/core';
import { HitIndex } from './hitIndex';
import { toScreen, type Vec2, type ViewTransform } from './viewTransform';

/** A digitized point as the overlay sees it. */
export interface OverlayPoint {
  /** Unique within the graph: `${datasetId}/${pointId}`. */
  readonly key: string;
  readonly datasetId: string;
  readonly pointId: string;
  readonly px: Vec2;
  readonly color: string;
}

/** Everything the overlay draws for one graph, derived from the project; rebuilt when the graph changes. */
export interface OverlayModel {
  readonly points: readonly OverlayPoint[];
  readonly hits: HitIndex<OverlayPoint>;
}

export function overlayModel(graph: Graph): OverlayModel {
  const points = graph.datasets.flatMap((d) =>
    d.points.map((p) => ({
      key: `${d.id}/${p.id}`,
      datasetId: d.id,
      pointId: p.id,
      px: p.px,
      color: d.color,
    })),
  );
  return { points, hits: new HitIndex(points) };
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
