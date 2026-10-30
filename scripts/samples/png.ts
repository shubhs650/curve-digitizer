// Minimal PNG codec for the samples harness and scripts/render-samples.ts: 8-bit gray, RGB and RGBA,
// non-interlaced. That covers what Chromium screenshots and the sample renderer write; anything else is
// rejected rather than guessed at. Node-only (node:zlib); the app decodes images with the browser.
import { crc32, deflateSync, inflateSync } from 'node:zlib';

export interface RasterImage {
  readonly width: number;
  readonly height: number;
  /** 1 = gray, 3 = RGB, 4 = RGBA; 8 bits per channel, rows top to bottom, no padding. */
  readonly channels: 1 | 3 | 4;
  readonly data: Uint8Array;
}

const SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const COLOUR_TYPE_CHANNELS: Readonly<Record<number, RasterImage['channels']>> = { 0: 1, 2: 3, 6: 4 };
const CHANNELS_COLOUR_TYPE: Readonly<Record<RasterImage['channels'], number>> = { 1: 0, 3: 2, 4: 6 };

export function decodePng(bytes: Uint8Array): RasterImage {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length < 8 || !SIGNATURE.every((b, i) => buf[i] === b)) throw new Error('PNG: bad signature');
  let offset = 8;
  let header: { width: number; height: number; channels: RasterImage['channels'] } | undefined;
  const idat: Buffer[] = [];
  while (offset + 12 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const body = buf.subarray(offset + 8, offset + 8 + length);
    if (crc32(buf.subarray(offset + 4, offset + 8 + length)) !== buf.readUInt32BE(offset + 8 + length)) {
      throw new Error(`PNG: CRC mismatch in ${type}`);
    }
    offset += 12 + length;
    if (type === 'IHDR') {
      const [depth, colourType, , , interlace] = body.subarray(8, 13);
      if (depth !== 8) throw new Error(`PNG: bit depth ${String(depth)} is not supported`);
      const channels = COLOUR_TYPE_CHANNELS[colourType ?? -1];
      if (channels === undefined) throw new Error(`PNG: colour type ${String(colourType)} is not supported`);
      if (interlace !== 0) throw new Error('PNG: interlaced images are not supported');
      header = { width: body.readUInt32BE(0), height: body.readUInt32BE(4), channels };
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
  }
  if (!header) throw new Error('PNG: missing IHDR');
  const { width, height, channels } = header;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== height * (stride + 1)) throw new Error('PNG: image data has the wrong length');
  const data = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    unfilter(filter, src, data, y * stride, stride, channels);
  }
  return { width, height, channels, data };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function unfilter(
  filter: number,
  src: Uint8Array,
  out: Uint8Array,
  rowStart: number,
  stride: number,
  bpp: number,
): void {
  const at = (i: number): number => out[i] ?? 0;
  for (let i = 0; i < stride; i++) {
    const x = src[i] ?? 0;
    const a = i >= bpp ? at(rowStart + i - bpp) : 0;
    const b = rowStart > 0 ? at(rowStart - stride + i) : 0;
    const c = i >= bpp && rowStart > 0 ? at(rowStart - stride + i - bpp) : 0;
    let value: number;
    switch (filter) {
      case 0:
        value = x;
        break;
      case 1:
        value = x + a;
        break;
      case 2:
        value = x + b;
        break;
      case 3:
        value = x + ((a + b) >> 1);
        break;
      case 4:
        value = x + paeth(a, b, c);
        break;
      default:
        throw new Error(`PNG: unknown filter type ${String(filter)}`);
    }
    out[rowStart + i] = value & 0xff;
  }
}

/** Encodes with a per-row adaptive filter (smallest sum of absolute residuals) and maximum deflate. */
export function encodePng(image: RasterImage): Uint8Array {
  const { width, height, channels, data } = image;
  const stride = width * channels;
  const raw = Buffer.alloc(height * (stride + 1));
  const candidate = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    let best = Infinity;
    for (let filter = 0; filter <= 4; filter++) {
      let cost = 0;
      for (let i = 0; i < stride; i++) {
        const at = (k: number): number => data[k] ?? 0;
        const row = y * stride;
        const a = i >= channels ? at(row + i - channels) : 0;
        const b = y > 0 ? at(row - stride + i) : 0;
        const c = i >= channels && y > 0 ? at(row - stride + i - channels) : 0;
        const predictor = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter] ?? 0;
        const residual = (at(row + i) - predictor) & 0xff;
        candidate[i] = residual;
        cost += residual < 128 ? residual : 256 - residual;
      }
      if (cost < best) {
        best = cost;
        raw[y * (stride + 1)] = filter;
        raw.set(candidate, y * (stride + 1) + 1);
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, CHANNELS_COLOUR_TYPE[channels], 0, 0, 0], 8);
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, body: Buffer): Buffer {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'ascii');
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

/** The RGB value of pixel (x, y), integer coordinates; gray is expanded and alpha ignored. */
export function pixel(image: RasterImage, x: number, y: number): [number, number, number] {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= image.width || y >= image.height) {
    throw new RangeError(`pixel (${String(x)}, ${String(y)}) is outside the image`);
  }
  const i = (y * image.width + x) * image.channels;
  const d = image.data;
  if (image.channels === 1) {
    const g = d[i] ?? 0;
    return [g, g, g];
  }
  return [d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0];
}
