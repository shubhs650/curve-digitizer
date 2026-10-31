import type { Graph, Vec2 } from '@cd/core';
import type { TraceBranch } from '@cd/trace';
import { useCallback, useMemo } from 'react';
import type { CanvasPointer, ToolHandlers } from '../canvas/tools';
import { toScreen, type ViewTransform } from '../canvas/viewTransform';
import { useWorkspace } from '../session/context';
import { clearTrace, runTrace } from './runTrace';
import { pickStart, type TraceSession, useTraceSession, useTraceStore } from './traceStore';

/** A click this close to a branch preview's tip (screen px) picks that branch. */
const BRANCH_RADIUS = 14;
const TRACE_COLOR = '#0f6cbd';
const BRANCH_COLORS = ['#c50f1f', '#107c10', '#8764b8', '#ca5010'];

export interface TraceTool {
  readonly tool: ToolHandlers;
  readonly decorate: (ctx: CanvasRenderingContext2D, view: ViewTransform) => void;
}

/** Branch previews are drawn at least this long on screen, px, so they can be told apart and clicked. */
const MIN_PREVIEW = 36;

/** Where a branch preview's numbered tip is drawn, in image px, at `scale` screen px per image px. */
export function branchTip(branch: TraceBranch, scale: number): Vec2 {
  const [p0, p1] = branch.preview;
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 1;
  const reach = Math.max(len, MIN_PREVIEW / scale);
  return [p0[0] + ((p1[0] - p0[0]) / len) * reach, p0[1] + ((p1[1] - p0[1]) / len) * reach];
}

/** The branch whose drawn tip is nearest the click `p` (image px), within BRANCH_RADIUS screen px. */
export function nearestBranch(branches: readonly TraceBranch[], p: Vec2, scale: number): number {
  let best = -1;
  let bestDistance = BRANCH_RADIUS / scale;
  branches.forEach((b, i) => {
    const tip = branchTip(b, scale);
    const d = Math.hypot(tip[0] - p[0], tip[1] - p[1]);
    if (d <= bestDistance) {
      best = i;
      bestDistance = d;
    }
  });
  return best;
}

/**
 * Guided trace (T): click the curve where the trace starts, then where it stops (or press Trace to the ends in
 * the panel). At an ambiguity, click the branch to follow. Esc cancels.
 */
export function useTraceTool(graph: Graph): TraceTool {
  const workspace = useWorkspace();
  const session = useTraceSession(graph.id);

  const tool = useMemo<ToolHandlers>(() => {
    const readFile = (path: string) => workspace.readFile(path);
    return {
      cursor: 'crosshair',
      onDown: (pointer: CanvasPointer) => {
        switch (session?.phase) {
          case 'running':
            break;
          case 'end':
            useTraceStore.getState().setSession((s) => (s ? { ...s, end: pointer.image } : s));
            void runTrace(graph, readFile);
            break;
          case 'branch': {
            const pick = nearestBranch(session.branches, pointer.image, pointer.scale);
            const branch = session.branches[pick];
            if (branch) void runTrace(graph, readFile, branch);
            break;
          }
          default:
            pickStart(graph.id, pointer.image);
        }
        return false;
      },
      onKeyDown: (event: KeyboardEvent) => {
        if (event.key !== 'Escape' || session === null) return false;
        clearTrace();
        return true;
      },
    };
  }, [graph, session, workspace]);

  const decorate = useCallback(
    (ctx: CanvasRenderingContext2D, view: ViewTransform) => {
      if (session) paintTrace(ctx, view, session);
    },
    [session],
  );

  return { tool, decorate };
}

function marker(ctx: CanvasRenderingContext2D, view: ViewTransform, p: Vec2, color: string) {
  const [x, y] = toScreen(view, p);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, 6, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** The traced path (blue over a white halo), the start and end picks, and numbered branch previews. */
export function paintTrace(ctx: CanvasRenderingContext2D, view: ViewTransform, session: TraceSession): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (session.nodes.length > 1) {
    for (const [color, width] of [
      ['rgba(255, 255, 255, 0.9)', 5],
      [TRACE_COLOR, 2.5],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      session.nodes.forEach((n, i) => {
        const [x, y] = toScreen(view, n.px);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }
  marker(ctx, view, session.start, TRACE_COLOR);
  if (session.end) marker(ctx, view, session.end, TRACE_COLOR);
  ctx.font = '600 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  session.branches.forEach((b, i) => {
    const color = BRANCH_COLORS[i % BRANCH_COLORS.length] ?? TRACE_COLOR;
    const [x0, y0] = toScreen(view, b.preview[0]);
    const [tx, ty] = toScreen(view, branchTip(b, view.scale));
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(tx, ty, 9, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(i + 1), tx, ty);
  });
  ctx.restore();
}
