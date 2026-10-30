// The contract between the main thread and the render/compute workers (docs/ARCHITECTURE.md §7).
// Workers expose a `WorkerApi` through Comlink; the main thread talks to it only through `WorkerClient`.

/** A progress report; `fraction` is in [0, 1]. */
export interface Progress {
  readonly fraction: number;
  readonly message?: string;
}

export type ProgressCallback = (progress: Progress) => void;

/** What a running task can do besides compute. */
export interface TaskContext {
  /** True once the caller cancelled. Cheap enough for inner loops. */
  readonly cancelled: boolean;
  /**
   * Throws `CancelledError` once the caller cancelled. For tight synchronous loops between checkpoints.
   * Without a shared cancel flag (page not cross-origin isolated) it only sees a cancel after a `checkpoint()`.
   */
  throwIfCancelled(): void;
  /** Reports progress, throttled so a chatty loop cannot flood the main thread. Values are clamped into [0, 1]. */
  progress(fraction: number, message?: string): void;
  /**
   * Await this at least every 10 ms of work. Throws `CancelledError` once cancelled, and yields to the
   * worker's event loop every 10 ms so cancel messages arrive when there is no shared cancel flag.
   */
  checkpoint(): Promise<void>;
}

/** A unit of work a worker can run. Tasks must not touch the DOM; they run inside a worker. */
export interface Task<I, O> {
  run(input: I, ctx: TaskContext): O | Promise<O>;
  /** Buffers inside the output to move to the caller instead of copying. */
  transferables?(output: O): readonly Transferable[];
}

/** The tasks one worker type offers, by name. */
export type TaskSet = Readonly<Record<string, Task<never, unknown>>>;

export type TaskName<Tasks extends TaskSet> = keyof Tasks & string;
export type TaskInput<T> = T extends Task<infer I, unknown> ? I : never;
export type TaskOutput<T> = T extends Task<never, infer O> ? O : never;

/** How a task ended. Failures are rejections, so callers handle cancellation without try/catch. */
export type TaskOutcome<O> =
  { readonly status: 'done'; readonly value: O } | { readonly status: 'cancelled' };

export interface TaskRequest {
  /** Unique per client; `cancel` refers to it. */
  readonly id: number;
  readonly name: string;
  readonly input: unknown;
  /** `Int32Array` over a `SharedArrayBuffer` the caller raises to cancel, or null when the page is not cross-origin isolated. */
  readonly cancelFlag: Int32Array | null;
}

/** The object a worker exposes through Comlink. Untyped by task; `WorkerClient` adds the per-task types. */
export interface WorkerApi {
  run(request: TaskRequest, onProgress: ProgressCallback | undefined): Promise<TaskOutcome<unknown>>;
  /** Cancels a running task by id. Fallback for when there is no shared cancel flag; unknown ids are ignored. */
  cancel(id: number): void;
}
