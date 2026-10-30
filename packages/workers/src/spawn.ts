import { WorkerClient } from './client.ts';
import { computePoolSize, WorkerPool } from './pool.ts';
import type { ComputeTasks, RenderTasks } from './tasks.ts';

// `new Worker(new URL(..., import.meta.url))` must stay literal so Vite bundles the entries as worker chunks.

export function createRenderWorker(): WorkerClient<RenderTasks> {
  return new WorkerClient(
    new Worker(new URL('./render.worker.ts', import.meta.url), { type: 'module', name: 'render' }),
  );
}

export function createComputePool(
  size = computePoolSize(navigator.hardwareConcurrency),
): WorkerPool<ComputeTasks> {
  return new WorkerPool(
    Array.from(
      { length: size },
      (_, i) =>
        new WorkerClient<ComputeTasks>(
          new Worker(new URL('./compute.worker.ts', import.meta.url), {
            type: 'module',
            name: `compute-${String(i)}`,
          }),
        ),
    ),
  );
}
