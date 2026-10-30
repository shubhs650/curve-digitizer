import { createRenderWorker, type RenderTasks, type WorkerClient } from '@cd/workers';

let worker: WorkerClient<RenderTasks> | null = null;

/** The app's one render worker (ARCHITECTURE §7), started on first use. */
export function renderWorker(): WorkerClient<RenderTasks> {
  worker ??= createRenderWorker();
  return worker;
}
