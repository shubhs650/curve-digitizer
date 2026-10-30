import type { TaskSet } from './api.ts';

// Task registries per worker type. Empty until the features land: render gets PDF tasks in M1 task 1.7,
// compute gets the filter stack, tracers and fits from M2 task 2.1 onwards.

export const renderTasks = {} satisfies TaskSet;
export type RenderTasks = typeof renderTasks;

export const computeTasks = {} satisfies TaskSet;
export type ComputeTasks = typeof computeTasks;
