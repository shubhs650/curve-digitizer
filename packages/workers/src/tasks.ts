import type { TaskSet } from './api.ts';
import { exportFile } from './tasks/export.ts';
import { imageToPng } from './tasks/image.ts';
import { pdfClose, pdfCrop, pdfOpen, pdfThumbnail } from './tasks/pdf.ts';

// Task registries per worker type. Compute gets the filter stack, tracers and fits from M2 task 2.1 onwards.

export const renderTasks = { imageToPng, pdfOpen, pdfThumbnail, pdfCrop, pdfClose } satisfies TaskSet;
export type RenderTasks = typeof renderTasks;

export const computeTasks = { exportFile } satisfies TaskSet;
export type ComputeTasks = typeof computeTasks;
