import type { TaskSet } from './api.ts';
import { cdzRead, cdzWrite } from './tasks/cdz.ts';
import { exportFile } from './tasks/export.ts';
import { imageToPng } from './tasks/image.ts';
import { processImage } from './tasks/process.ts';
import { pdfClose, pdfCrop, pdfCropPng, pdfOpen, pdfThumbnail } from './tasks/pdf.ts';

// Task registries per worker type. Compute runs the filter stack (task 2.1), the tracers and the fits.

export const renderTasks = {
  imageToPng,
  pdfOpen,
  pdfThumbnail,
  pdfCrop,
  pdfCropPng,
  pdfClose,
} satisfies TaskSet;
export type RenderTasks = typeof renderTasks;

export const computeTasks = { exportFile, cdzWrite, cdzRead, processImage } satisfies TaskSet;
export type ComputeTasks = typeof computeTasks;
