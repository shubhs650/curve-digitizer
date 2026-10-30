import { describe, expect, it } from 'vitest';
import { IMAGE_MIME_TYPES, pngSize, sniffImageType } from './format.ts';

/** The first 40 bytes of a 2400 × 1600 PNG: signature, then the IHDR chunk. */
const vectorClean = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x09, 0x60, 0, 0,
  0x06, 0x40, 8, 2, 0, 0, 0, 0x12, 0x34, 0x56, 0x78, 0, 0, 0, 0, 0x49, 0x44, 0x41,
]);

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);
const ascii = (text: string): Uint8Array => Uint8Array.from(text, (c) => c.charCodeAt(0));

describe('sniffImageType', () => {
  it('recognises PNG, JPEG and WebP by their signatures', () => {
    expect(sniffImageType(vectorClean)).toBe('png');
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe('jpeg');
    const webp = ascii('RIFF\0\0\0\0WEBPVP8 ');
    expect(sniffImageType(webp)).toBe('webp');
  });

  it('rejects anything else, including truncated signatures', () => {
    expect(sniffImageType(ascii('%PDF-1.7'))).toBeNull();
    expect(sniffImageType(ascii('RIFF\0\0\0\0WAVE'))).toBeNull();
    expect(sniffImageType(bytes(0x89, 0x50))).toBeNull();
    expect(sniffImageType(bytes())).toBeNull();
  });

  it('maps every type to its MIME type', () => {
    expect(IMAGE_MIME_TYPES).toEqual({ png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp' });
  });
});

describe('pngSize', () => {
  it('reads the IHDR dimensions', () => {
    expect(pngSize(vectorClean)).toEqual({ width: 2400, height: 1600 });
  });

  it('rejects a PNG without a readable IHDR', () => {
    expect(() => pngSize(vectorClean.slice(0, 20))).toThrow(RangeError);
    const broken = vectorClean.slice(0, 40);
    broken[12] = 0x58; // IHDR → XHDR
    expect(() => pngSize(broken)).toThrow(RangeError);
  });

  it('rejects zero dimensions', () => {
    const empty = vectorClean.slice(0, 40);
    empty.fill(0, 16, 24);
    expect(() => pngSize(empty)).toThrow(RangeError);
  });
});
