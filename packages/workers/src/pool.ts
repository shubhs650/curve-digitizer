import type { TaskInput, TaskName, TaskOutcome, TaskOutput, TaskSet } from './api.ts';
import type { RunOptions, WorkerClient } from './client.ts';

/** docs/ARCHITECTURE.md §7: n = hardwareConcurrency − 1, minimum 1, so the main thread keeps a core. */
export function computePoolSize(hardwareConcurrency: number | undefined): number {
  return Math.max(1, (hardwareConcurrency ?? 2) - 1);
}

/** Spreads tasks over identical workers, each to the one with the fewest tasks in flight. */
export class WorkerPool<Tasks extends TaskSet> {
  readonly #clients: readonly WorkerClient<Tasks>[];

  constructor(clients: readonly WorkerClient<Tasks>[]) {
    if (clients.length === 0) throw new RangeError('A worker pool needs at least one worker');
    this.#clients = clients;
  }

  get size(): number {
    return this.#clients.length;
  }

  run<K extends TaskName<Tasks>>(
    name: K,
    input: TaskInput<Tasks[K]>,
    options?: RunOptions,
  ): Promise<TaskOutcome<TaskOutput<Tasks[K]>>> {
    return this.#leastBusy().run(name, input, options);
  }

  terminate(): void {
    for (const client of this.#clients) client.terminate();
  }

  #leastBusy(): WorkerClient<Tasks> {
    let best = this.#clients[0] as WorkerClient<Tasks>;
    for (const client of this.#clients) if (client.pending < best.pending) best = client;
    return best;
  }
}
