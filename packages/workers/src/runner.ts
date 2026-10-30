import { releaseProxy, transfer } from 'comlink';
import type { ProgressCallback, TaskContext, TaskOutcome, TaskRequest, TaskSet, WorkerApi } from './api.ts';
import { CancelledError, isCancelFlagRaised } from './cancel.ts';

/** About 20 reports a second is smooth for a progress bar and cheap to post. */
const PROGRESS_INTERVAL_MS = 50;
/** CLAUDE.md: honour cancellation every ≤ 10 ms of work. */
const YIELD_INTERVAL_MS = 10;

export interface RunnerOptions {
  /** Milliseconds clock; injectable so throttling is testable. */
  readonly now?: () => number;
}

/** Builds the object a worker entry passes to Comlink's `expose`. */
export function createWorkerApi(tasks: TaskSet, options: RunnerOptions = {}): WorkerApi {
  const now = options.now ?? (() => performance.now());
  const running = new Map<number, RunningTask>();

  return {
    async run(request: TaskRequest, onProgress: ProgressCallback | undefined): Promise<TaskOutcome<unknown>> {
      // Registered before the first await so a cancel sent right after `run` finds it.
      const ctx = new RunningTask(request.cancelFlag, onProgress, now);
      running.set(request.id, ctx);
      try {
        const task = Object.hasOwn(tasks, request.name) ? tasks[request.name] : undefined;
        if (task === undefined) throw new Error(`Unknown task "${request.name}"`);
        ctx.throwIfCancelled();
        const value = await task.run(request.input as never, ctx);
        const outcome = { status: 'done', value } as const;
        return task.transferables ? transfer(outcome, [...task.transferables(value)]) : outcome;
      } catch (error) {
        if (error instanceof CancelledError) return { status: 'cancelled' };
        throw error;
      } finally {
        running.delete(request.id);
        ctx.dispose();
      }
    },

    cancel(id: number): void {
      running.get(id)?.cancel();
    },
  };
}

class RunningTask implements TaskContext {
  readonly #flag: Int32Array | null;
  readonly #onProgress: ProgressCallback | undefined;
  readonly #now: () => number;
  #cancelled = false;
  #lastProgress = Number.NEGATIVE_INFINITY;
  #lastYield: number;

  constructor(flag: Int32Array | null, onProgress: ProgressCallback | undefined, now: () => number) {
    this.#flag = flag;
    this.#onProgress = onProgress;
    this.#now = now;
    this.#lastYield = now();
  }

  get cancelled(): boolean {
    return this.#cancelled || (this.#flag !== null && isCancelFlagRaised(this.#flag));
  }

  cancel(): void {
    this.#cancelled = true;
  }

  throwIfCancelled(): void {
    if (this.cancelled) throw new CancelledError();
  }

  progress(fraction: number, message?: string): void {
    if (this.#onProgress === undefined) return;
    const clamped = Number.isNaN(fraction) ? 0 : Math.min(1, Math.max(0, fraction));
    const t = this.#now();
    if (clamped < 1 && t - this.#lastProgress < PROGRESS_INTERVAL_MS) return;
    this.#lastProgress = t;
    // Not awaited: over Comlink this is a postMessage, and the task must not wait on the main thread.
    this.#onProgress(message === undefined ? { fraction: clamped } : { fraction: clamped, message });
  }

  async checkpoint(): Promise<void> {
    this.throwIfCancelled();
    // Yield even with a shared flag: it is cheap at this interval and keeps the worker responsive to messages.
    if (this.#now() - this.#lastYield < YIELD_INTERVAL_MS) return;
    await yieldToEventLoop();
    this.#lastYield = this.#now();
    this.throwIfCancelled();
  }

  /** Lets Comlink close the callback's port once the task is over. Plain functions (in tests) have nothing to release. */
  dispose(): void {
    const release = (this.#onProgress as { readonly [releaseProxy]?: () => void } | undefined)?.[
      releaseProxy
    ];
    if (release !== undefined) release();
  }
}

/** A macrotask boundary. MessageChannel avoids the ≥ 4 ms clamp nested `setTimeout`s get. */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = () => {
      port1.close();
      resolve();
    };
    port2.postMessage(null);
  });
}
