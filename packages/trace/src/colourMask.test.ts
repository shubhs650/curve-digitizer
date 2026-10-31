import { canvas, curve, stroke, type Pt } from '@cd/image/testing';
import { describe, expect, it } from 'vitest';
import { nearestComponent, openMask, traceColourMask } from './colourMask.ts';
import { NoCurveError } from './guided.ts';

const BLUE: [number, number, number] = [31, 119, 180];
const ORANGE: [number, number, number] = [255, 127, 14];
const GREY: [number, number, number] = [200, 200, 200];
const BLACK: [number, number, number] = [0, 0, 0];

function distanceTo(line: readonly Pt[], p: readonly [number, number]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1] as Pt;
    const b = line[i] as Pt;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  }
  return best;
}

const rms = (values: readonly number[]) => Math.sqrt(values.reduce((s, v) => s + v * v, 0) / values.length);
const wave = (x: number) => 150 + 60 * Math.sin(x / 70);

describe('traceColourMask', () => {
  it('extracts a curve as one ordered centreline path', async () => {
    const img = canvas(600, 300);
    const line = curve(wave, 20, 580);
    stroke(img, line, 3, BLUE);
    const result = await traceColourMask(img, { color: BLUE });
    expect(result.components).toHaveLength(1);
    const [c] = result.components;
    if (!c) return;
    expect(rms(c.path.map((p) => distanceTo(line, p)))).toBeLessThan(0.6);
    // Ordered: consecutive path pixels touch.
    for (let i = 1; i < c.path.length; i++) {
      const a = c.path[i - 1] as Pt;
      const b = c.path[i] as Pt;
      expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeLessThan(1.5);
    }
    const xs = c.path.map((p) => p[0]);
    expect(Math.min(...xs)).toBeLessThan(23);
    expect(Math.max(...xs)).toBeGreaterThan(577);
    expect(c.lengthPx).toBeGreaterThan(600);
    expect(c.lineWidthPx).toBeGreaterThan(2);
    expect(c.lineWidthPx).toBeLessThan(4.5);
    // Output points: dense enough for the density setting, all on the curve.
    expect(c.points.length).toBeGreaterThan(100);
    for (const p of c.points) expect(distanceTo(line, p.px)).toBeLessThan(1.2);
  });

  it('ignores other colours and grid lines', async () => {
    const img = canvas(600, 300);
    for (let x = 50; x < 600; x += 50)
      stroke(
        img,
        [
          [x, 0],
          [x, 300],
        ],
        1,
        GREY,
      );
    for (let y = 50; y < 300; y += 50)
      stroke(
        img,
        [
          [0, y],
          [600, y],
        ],
        1,
        GREY,
      );
    const blue = curve(wave, 20, 580);
    stroke(img, blue, 3, BLUE);
    stroke(
      img,
      curve((x) => 60 + x / 4, 20, 580),
      3,
      ORANGE,
    );
    const result = await traceColourMask(img, { color: BLUE });
    const kept = result.components.filter((c) => c.lengthPx > 100);
    expect(kept).toHaveLength(1);
    for (const p of kept[0]?.path ?? []) expect(distanceTo(blue, p)).toBeLessThan(1.5);
  });

  it('joins the pieces of a curve that another curve crosses on top of it', async () => {
    const img = canvas(600, 300);
    const blue = curve(wave, 20, 580);
    stroke(img, blue, 3, BLUE);
    // Drawn after the blue curve, so it cuts it in two places.
    stroke(
      img,
      curve((x) => 60 + x / 3, 20, 580),
      3,
      ORANGE,
    );
    const result = await traceColourMask(img, { color: BLUE });
    expect(result.components).toHaveLength(1);
    const xs = (result.components[0]?.path ?? []).map((p) => p[0]);
    expect(Math.min(...xs)).toBeLessThan(23);
    expect(Math.max(...xs)).toBeGreaterThan(577);
  });

  it('keeps separate curves of one colour as separate components, longest first', async () => {
    const img = canvas(600, 300);
    stroke(
      img,
      curve((x) => 60 + x / 10, 20, 580),
      3,
      BLACK,
    );
    stroke(
      img,
      curve((x) => 240 - x / 10, 100, 400),
      3,
      BLACK,
    );
    const result = await traceColourMask(img, { color: BLACK });
    expect(result.components).toHaveLength(2);
    expect(result.components[0]?.lengthPx).toBeGreaterThan(result.components[1]?.lengthPx ?? Infinity);
    expect(nearestComponent(result.components, [300, 210])).toBe(1);
    expect(nearestComponent(result.components, [300, 90])).toBe(0);
    expect(nearestComponent(result.components, [300, 150], 10)).toBe(-1);
  });

  it('drops specks shorter than the minimum length', async () => {
    const img = canvas(300, 200);
    stroke(
      img,
      curve(() => 100, 20, 280),
      3,
      BLACK,
    );
    stroke(
      img,
      [
        [50, 40],
        [56, 40],
      ],
      3,
      BLACK,
    );
    stroke(
      img,
      [
        [150, 160],
        [150.5, 160],
      ],
      2,
      BLACK,
    );
    const result = await traceColourMask(img, { color: BLACK });
    expect(result.components).toHaveLength(1);
    const more = await traceColourMask(img, { color: BLACK, minLengthPx: 3 });
    expect(more.components.length).toBeGreaterThan(1);
  });

  it('keeps one-pixel lines that a morphological open would erase', async () => {
    const img = canvas(300, 200);
    stroke(
      img,
      curve((x) => 100 + x / 5, 20, 280),
      1,
      BLACK,
    );
    const result = await traceColourMask(img, { color: BLACK });
    expect(result.components).toHaveLength(1);
    expect(result.components[0]?.lengthPx).toBeGreaterThan(250);
  });

  it('widens the selection with the tolerance', async () => {
    const img = canvas(300, 200);
    stroke(
      img,
      curve(() => 60, 20, 280),
      3,
      [31, 119, 180],
    );
    stroke(
      img,
      curve(() => 140, 20, 280),
      3,
      [70, 140, 190],
    );
    const tight = await traceColourMask(img, { color: BLUE, tolerance: 10 });
    expect(tight.components).toHaveLength(1);
    const loose = await traceColourMask(img, { color: BLUE, tolerance: 40 });
    expect(loose.components).toHaveLength(2);
  });

  it('refuses a colour that is the paper', async () => {
    const img = canvas(100, 100);
    stroke(
      img,
      curve(() => 50, 10, 90),
      3,
      BLACK,
    );
    await expect(traceColourMask(img, { color: [250, 250, 250] })).rejects.toBeInstanceOf(NoCurveError);
  });

  it('reports progress and can be cancelled', async () => {
    const img = canvas(400, 300);
    stroke(img, curve(wave, 20, 380), 3, BLUE);
    const fractions: number[] = [];
    await traceColourMask(img, { color: BLUE }, { tick: (f) => fractions.push(f) });
    expect(fractions.length).toBeGreaterThan(4);
    expect(fractions.at(-1)).toBe(1);
    for (let i = 1; i < fractions.length; i++) {
      expect(fractions[i]).toBeGreaterThanOrEqual(fractions[i - 1] ?? 0);
    }
    const cancel = new Error('cancelled');
    await expect(
      traceColourMask(
        img,
        { color: BLUE },
        {
          tick: (f) => {
            if (f > 0.3) throw cancel;
          },
        },
      ),
    ).rejects.toBe(cancel);
  });
});

describe('openMask', () => {
  it('removes isolated pixels and one-pixel lines and keeps the core of wider strokes', () => {
    const width = 20;
    const height = 12;
    const data = new Uint8Array(width * height);
    // A bar 3 px high, a 1 px line and a lone pixel.
    for (let y = 2; y < 5; y++) for (let x = 2; x < 12; x++) data[y * width + x] = 1;
    for (let x = 2; x < 12; x++) data[8 * width + x] = 1;
    data[5 * width + 16] = 1;
    const opened = openMask({ width, height, data });
    for (let x = 2; x < 12; x++) expect(opened.data[3 * width + x]).toBe(1);
    for (let x = 3; x < 11; x++) expect(opened.data[2 * width + x]).toBe(1);
    expect(opened.data.slice(6 * width).every((v) => v === 0)).toBe(true);
    expect(opened.data[5 * width + 16]).toBe(0);
  });
});
