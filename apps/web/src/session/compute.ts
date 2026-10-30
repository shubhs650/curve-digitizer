import { type ComputeTasks, createComputePool, type WorkerPool } from '@cd/workers';

let pool: WorkerPool<ComputeTasks> | null = null;

/** The app's compute worker pool, started on first use so image-only cold load stays light (P1). */
export function computePool(): WorkerPool<ComputeTasks> {
  pool ??= createComputePool();
  return pool;
}
