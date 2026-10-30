import type { TaskSet } from './api.ts';
import { exportFile } from './tasks/export.ts';
import { imageToPng } from './tasks/image.ts';

// Task registries per worker type. Render gets the PDF tasks in M1 task 1.7; compute gets exports now and the
// filter stack, tracers and fits from M2 task 2.1 onwards.

export const renderTasks = { imageToPng } satisfies TaskSet;
export type RenderTasks = typeof renderTasks;

export const computeTasks = { exportFile } satisfies TaskSet;
export type ComputeTasks = typeof computeTasks;
