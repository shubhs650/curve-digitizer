import type { Task } from '../api.ts';

export interface ImageToPngInput {
  /** Encoded image bytes (JPEG, WebP, …); transferred in. */
  readonly bytes: ArrayBuffer;
  readonly mimeType: string;
}

export interface ImageToPngOutput {
  /** Lossless PNG of the decoded pixels; transferred out. */
  readonly png: ArrayBuffer;
  readonly width: number;
  readonly height: number;
}

/**
 * Re-encodes an image as PNG, the only format a Graph stores (docs/PROJECT_SCHEMA.md). Decoding skips colour
 * management and premultiplication so the stored pixels are the file's own pixels.
 */
export const imageToPng: Task<ImageToPngInput, ImageToPngOutput> = {
  async run({ bytes, mimeType }, ctx) {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeType }), {
      colorSpaceConversion: 'none',
      premultiplyAlpha: 'none',
    });
    try {
      ctx.throwIfCancelled();
      const { width, height } = bitmap;
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      if (context === null) throw new Error('OffscreenCanvas 2D context unavailable');
      context.drawImage(bitmap, 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      ctx.throwIfCancelled();
      return { png: await blob.arrayBuffer(), width, height };
    } finally {
      bitmap.close();
    }
  },
  transferables: (output) => [output.png],
};
