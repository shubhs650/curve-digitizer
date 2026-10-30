// Image file formats the app accepts as Graph sources (PRD §4.1). Detection is by signature, not by file name
// or MIME type, because pasted and dropped files often carry neither reliably.

export type ImageType = 'png' | 'jpeg' | 'webp';

export const IMAGE_MIME_TYPES: Readonly<Record<ImageType, string>> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const ascii = (text: string): number[] => Array.from(text, (c) => c.charCodeAt(0));
const RIFF = ascii('RIFF');
const WEBP = ascii('WEBP');

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b);
}

/** The image type of `bytes` from its leading signature, or null when it is not a PNG, JPEG or WebP file. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return 'png';
  if (startsWith(bytes, JPEG_SIGNATURE)) return 'jpeg';
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return 'webp';
  return null;
}

/**
 * Width and height of a PNG from its IHDR chunk, which the format requires to come first: bytes 8–15 are the
 * chunk length and type, 16–19 the width and 20–23 the height, big-endian.
 *
 * @throws RangeError when the IHDR chunk is missing or a dimension is zero.
 */
export function pngSize(bytes: Uint8Array): { readonly width: number; readonly height: number } {
  if (bytes.length < 24 || !startsWith(bytes, ascii('IHDR'), 12)) {
    throw new RangeError('PNG has no IHDR chunk');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width === 0 || height === 0) throw new RangeError('PNG has a zero dimension');
  return { width, height };
}
