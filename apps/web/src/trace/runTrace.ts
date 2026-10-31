import type { Graph, Vec2 } from '@cd/core';
import type { TraceBranch } from '@cd/trace';
import { imageSource } from '../processing/processedImage';
import { computePool } from '../session/compute';
import { type TraceSession, useTraceStore } from './traceStore';

let current: AbortController | null = null;

/** Performance marks around each run, for the P4 timing in e2e (local only, like any performance entry). */
export const TRACE_MARKS = { start: 'trace:start', progress: 'trace:progress', end: 'trace:end' } as const;

/** Cancels the run in flight; what was traced before it (earlier branches) stays. */
export function cancelTrace(): void {
  current?.abort();
  current = null;
  useTraceStore
    .getState()
    .setSession((s) => (s?.phase === 'running' ? { ...s, phase: s.nodes.length > 0 ? 'done' : 'end' } : s));
}

/** Ends the session (and any run). */
export function clearTrace(): void {
  current?.abort();
  current = null;
  useTraceStore.getState().setSession(() => null);
}

/**
 * Runs the guided tracer in the compute pool on the graph's processed image, from the session's start (or,
 * after a branch pick, from where it stopped in the chosen direction) to its end pick or the curve's ends.
 */
export async function runTrace(
  graph: Graph,
  readFile: (path: string) => Promise<Uint8Array>,
  branch?: TraceBranch,
): Promise<void> {
  const { session, setSession } = useTraceStore.getState();
  if (session?.graphId !== graph.id) return;
  const from: Vec2 = branch && session.at ? session.at : session.start;
  current?.abort();
  const abort = new AbortController();
  current = abort;
  const stale = () => abort.signal.aborted;
  setSession((s) => (s ? { ...s, phase: 'running', fraction: 0, branches: [], error: null } : s));
  performance.mark(TRACE_MARKS.start);
  try {
    const { source, transfer } = await imageSource(graph, readFile);
    const outcome = await computePool().run(
      'traceCurve',
      {
        source,
        steps: graph.processing,
        options: {
          start: from,
          ...(session.end === null ? {} : { end: session.end }),
          ...(session.color === null ? {} : { color: session.color }),
          ...(branch ? { direction: branch.direction } : {}),
        },
      },
      {
        signal: abort.signal,
        transfer,
        onProgress: (p) => {
          if (stale()) return;
          performance.mark(TRACE_MARKS.progress);
          setSession((s) => (s ? { ...s, fraction: p.fraction } : s));
        },
      },
    );
    if (outcome.status === 'cancelled' || stale()) return;
    performance.mark(TRACE_MARKS.end);
    const result = outcome.value;
    const nodes = result.path.map((px, i) => ({ px, width: result.widths[i] ?? 0 }));
    setSession((s): TraceSession | null => {
      if (!s) return s;
      // A continuation starts where the previous part stopped; drop the repeated point.
      const joined = branch ? [...s.nodes, ...nodes.slice(1)] : nodes;
      return {
        ...s,
        color: result.color,
        nodes: joined,
        fraction: 1,
        ...(result.status === 'ambiguous'
          ? { phase: 'branch', at: result.at, branches: result.branches, reachedEnd: false }
          : { phase: 'done', at: null, branches: [], reachedEnd: result.reachedEnd }),
      };
    });
  } catch (error) {
    if (stale()) return;
    setSession((s) =>
      s ? { ...s, phase: 'error', error: error instanceof Error ? error.message : String(error) } : s,
    );
  } finally {
    if (current === abort) current = null;
  }
}
