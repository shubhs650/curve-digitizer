import { IMAGE_MIME_TYPES } from '@cd/image';
import { renderWorker } from './renderWorker';
import type { PngEncoder } from './workspace';

/** Decodes and re-encodes in the render worker: a large JPEG takes far longer than the 50 ms main-thread budget. */
export const workerPngEncoder: PngEncoder = async (bytes, type) => {
  const buffer = bytes.slice().buffer;
  const outcome = await renderWorker().run(
    'imageToPng',
    { bytes: buffer, mimeType: IMAGE_MIME_TYPES[type] },
    { transfer: [buffer] },
  );
  if (outcome.status !== 'done') throw new Error('Image conversion was cancelled.');
  const { png, width, height } = outcome.value;
  return { png: new Uint8Array(png), width, height };
};
