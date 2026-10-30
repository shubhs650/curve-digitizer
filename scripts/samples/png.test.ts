import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { decodePng, encodePng, pixel, type RasterImage } from './png.ts';

function image(width: number, height: number, channels: RasterImage['channels']): RasterImage {
  const data = new Uint8Array(width * height * channels);
  for (let i = 0; i < data.length; i++) data[i] = (i * 37 + (i >> 3)) & 0xff;
  return { width, height, channels, data };
}

describe('PNG codec', () => {
  it.each([1, 3, 4] as const)('round-trips %i-channel 8-bit images', (channels) => {
    const original = image(13, 7, channels);
    const decoded = decodePng(encodePng(original));
    expect(decoded).toEqual(original);
  });

  it('decodes every scanline filter type', () => {
    // Hand-built 3×5 grayscale image, one row per filter type (None, Sub, Up, Average, Paeth).
    const rows = [
      [0, 10, 20, 30],
      [1, 5, 5, 5],
      [2, 1, 1, 1],
      [3, 4, 4, 4],
      [4, 1, 2, 3],
    ];
    const raw = Uint8Array.from(rows.flat());
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(3, 0);
    ihdr.writeUInt32BE(5, 4);
    ihdr.set([8, 0, 0, 0, 0], 8);
    const png = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]);
    const decoded = decodePng(png);
    expect(Array.from(decoded.data)).toEqual([10, 20, 30, 5, 10, 15, 6, 11, 16, 7, 13, 18, 8, 15, 21]);
  });

  it('rejects files that are not 8-bit non-interlaced gray, RGB or RGBA', () => {
    expect(() => decodePng(Buffer.from('not a png'))).toThrow(/signature/);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(1, 0);
    ihdr.writeUInt32BE(1, 4);
    ihdr.set([16, 2, 0, 0, 0], 8);
    const png = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IEND', Buffer.alloc(0)),
    ]);
    expect(() => decodePng(png)).toThrow(/bit depth 16/);
  });

  it('reads pixels as RGB whatever the channel count', () => {
    const gray: RasterImage = { width: 2, height: 1, channels: 1, data: Uint8Array.from([7, 200]) };
    expect(pixel(gray, 1, 0)).toEqual([200, 200, 200]);
    const rgba: RasterImage = { width: 1, height: 1, channels: 4, data: Uint8Array.from([1, 2, 3, 255]) };
    expect(pixel(rgba, 0, 0)).toEqual([1, 2, 3]);
    expect(() => pixel(rgba, 1, 0)).toThrow(RangeError);
  });
});

function chunk(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}
