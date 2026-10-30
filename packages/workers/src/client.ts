import { proxy, transfer, wrap, type Endpoint, type Remote } from 'comlink';
import type {
  ProgressCallback,
  TaskInput,
  TaskName,
  TaskOutcome,
  TaskOutput,
  TaskSet,
  WorkerApi,
} from './api.ts';
import { createCancelFlag, raiseCancelFlag } from './cancel.ts';

export interface RunOptions {
  /** Aborting cancels the task; the result is then `{ status: 'cancelled' }` unless the task already finished. */
  readonly signal?: AbortSignal;
  readonly onProgress?: ProgressCallback;
  /** Buffers inside the input to move to the worker instead of copying. They are unusable here afterwards. */
  readonly transfer?: readonly Transferable[];
}

/** A worker, or a MessagePort standing in for one in tests. */
export type WorkerEndpoint = Endpoint & { terminate?(): void; close?(): void };

/** Main-thread handle to one worker: typed task calls with progress, cancellation and transfer. */
export class WorkerClient<Tasks extends TaskSet> {
  readonly #endpoint: WorkerEndpoint;
  readonly #remote: Remote<WorkerApi>;
  readonly #terminated: Promise<never>;
  #rejectTerminated: (reason: Error) => void = () => undefined;
  #isTerminated = false;
  #nextId = 1;
  #pending = 0;

  constructor(endpoint: WorkerEndpoint) {
    this.#endpoint = endpoint;
    this.#remote = wrap<WorkerApi>(endpoint);
    this.#terminated = new Promise<never>((_, reject) => {
      this.#rejectTerminated = reject;
    });
    // Rejections are observed through `run`; this only keeps an idle termination from being reported as unhandled.
    this.#terminated.catch(() => undefined);
  }

  /** Tasks sent and not yet settled; the pool schedules on this. */
  get pending(): number {
    return this.#pending;
  }

  async run<K extends TaskName<Tasks>>(
    name: K,
    input: TaskInput<Tasks[K]>,
    options: RunOptions = {},
  ): Promise<TaskOutcome<TaskOutput<Tasks[K]>>> {
    if (this.#isTerminated) throw new Error('Worker terminated');
    const { signal, onProgress } = options;
    if (signal?.aborted === true) return { status: 'cancelled' };

    const id = this.#nextId++;
    const cancelFlag = createCancelFlag();
    const onAbort = (): void => {
      if (cancelFlag !== null) raiseCancelFlag(cancelFlag);
      void this.#remote.cancel(id);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    this.#pending++;
    try {
      const request = transfer({ id, name, input, cancelFlag }, [...(options.transfer ?? [])]);
      const outcome = await Promise.race([
        this.#remote.run(request, onProgress === undefined ? undefined : proxy(onProgress)),
        this.#terminated,
      ]);
      // The worker runs the task registered under `name`, so its output has that task's type.
      return outcome as TaskOutcome<TaskOutput<Tasks[K]>>;
    } finally {
      this.#pending--;
      signal?.removeEventListener('abort', onAbort);
    }
  }

  /** Stops the worker. Tasks still running reject with "Worker terminated". */
  terminate(): void {
    if (this.#isTerminated) return;
    this.#isTerminated = true;
    this.#rejectTerminated(new Error('Worker terminated'));
    if (this.#endpoint.terminate) this.#endpoint.terminate();
    else this.#endpoint.close?.();
  }
}
