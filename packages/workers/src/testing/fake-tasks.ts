import type { Task, TaskSet } from '../api.ts';
import { raiseCancelFlag } from '../cancel.ts';

/** Sums a transferred buffer in chunks, reporting progress; returns the sum and a transferred copy of the running totals. */
const sum: Task<
  { readonly values: Float64Array },
  { readonly total: number; readonly running: Float64Array }
> = {
  async run({ values }, ctx) {
    const running = new Float64Array(values.length);
    let total = 0;
    for (let i = 0; i < values.length; i++) {
      total += values[i] ?? 0;
      running[i] = total;
      if (i % 16 === 0) {
        ctx.progress(i / values.length);
        await ctx.checkpoint();
      }
    }
    ctx.progress(1);
    return { total, running };
  },
  transferables: (output) => [output.running.buffer],
};

/** Simulates work that never ends on its own; only cancellation stops it. The cap turns a hang into a failing assertion. */
const spin: Task<{ readonly cap: number }, number> = {
  async run({ cap }, ctx) {
    let i = 0;
    for (; i < cap; i++) {
      ctx.progress(i / cap);
      await ctx.checkpoint();
    }
    return i;
  },
};

/** Stands in for another thread raising the shared flag while a tight synchronous loop runs. */
const raiseFlagAt: Task<{ readonly at: number; readonly flag: Int32Array; readonly cap: number }, number> = {
  run({ at, flag, cap }, ctx) {
    for (let i = 0; i < cap; i++) {
      if (i === at) raiseCancelFlag(flag);
      ctx.throwIfCancelled();
    }
    return cap;
  },
};

const fail: Task<{ readonly message: string }, never> = {
  run({ message }) {
    throw new Error(message);
  },
};

export const fakeTasks = { sum, spin, raiseFlagAt, fail } satisfies TaskSet;
export type FakeTasks = typeof fakeTasks;

/** A clock that advances by `stepMs` each time it is read, so time-based throttles are deterministic. */
export function steppingClock(stepMs: number): () => number {
  let t = 0;
  return () => (t += stepMs);
}
