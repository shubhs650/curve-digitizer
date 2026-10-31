import { canvas, curve, stroke, type Pt } from '@cd/image/testing';
import { describe, expect, it } from 'vitest';
import { NoCurveError, simplify, traceGuided } from './guided.ts';
import { inkMap, paperColor } from './ink.ts';

const BLACK: [number, number, number] = [0, 0, 0];
const BLUE: [number, number, number] = [31, 119, 180];

/** Distance from p to the polyline. */
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

describe('traceGuided', () => {
  it('follows a smooth curve from start to end on its centreline', async () => {
    const img = canvas(600, 300);
    const line = curve(wave, 20, 580);
    stroke(img, line, 3, BLUE);
    const result = await traceGuided(img, { start: [60, wave(60) + 2], end: [540, wave(540)] });
    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result.reachedEnd).toBe(true);
    expect(rms(result.points.map((p) => distanceTo(line, p.px)))).toBeLessThan(0.2);
    const xs = result.points.map((p) => p.px[0]);
    expect(Math.min(...xs)).toBeLessThan(62);
    expect(Math.max(...xs)).toBeGreaterThan(535);
    for (const p of result.points) expect(p.lineWidthPx).toBeGreaterThan(2);
    for (const p of result.points) expect(p.lineWidthPx).toBeLessThan(4);
  });

  it('spaces output points by the density setting', async () => {
    const img = canvas(600, 300);
    stroke(img, curve(wave, 20, 580), 3, BLUE);
    const result = await traceGuided(img, { start: [60, wave(60)], end: [540, wave(540)], spacingPx: 12 });
    const gaps = result.points
      .slice(1)
      .map((p, i) =>
        Math.hypot(p.px[0] - (result.points[i]?.px[0] ?? 0), p.px[1] - (result.points[i]?.px[1] ?? 0)),
      );
    expect(Math.max(...gaps)).toBeLessThan(14);
    expect(result.points.length).toBeGreaterThan(35);
    expect(result.points.length).toBeLessThan(70);
  });

  it('traces both ways to the curve ends without an end pick', async () => {
    const img = canvas(600, 300);
    stroke(img, curve(wave, 20, 580), 3, BLACK);
    const result = await traceGuided(img, { start: [300, wave(300)] });
    const xs = result.points.map((p) => p.px[0]);
    expect(Math.min(...xs)).toBeLessThan(24);
    expect(Math.max(...xs)).toBeGreaterThan(576);
    // Ordered along the curve.
    const increasing = xs.every((x, i) => i === 0 || x > (xs[i - 1] ?? 0));
    const decreasing = xs.every((x, i) => i === 0 || x < (xs[i - 1] ?? 0));
    expect(increasing || decreasing).toBe(true);
  });

  it('bridges dashes and stops after a gap longer than maxGapPx', async () => {
    const img = canvas(600, 200);
    for (let x = 20; x < 560; x += 22)
      stroke(
        img,
        [
          [x, 100],
          [x + 14, 100],
        ],
        2.5,
        BLACK,
      );
    const result = await traceGuided(img, { start: [48, 100], end: [540, 100] });
    expect(result.status).toBe('done');
    expect(Math.max(...result.points.map((p) => p.px[0]))).toBeGreaterThan(535);
    for (const p of result.points) expect(Math.abs(p.px[1] - 100)).toBeLessThan(0.3);

    const gappy = canvas(600, 200);
    stroke(
      gappy,
      [
        [20, 100],
        [200, 100],
      ],
      2.5,
      BLACK,
    );
    stroke(
      gappy,
      [
        [240, 100],
        [580, 100],
      ],
      2.5,
      BLACK,
    );
    const short = await traceGuided(gappy, { start: [40, 100], end: [560, 100], maxGapPx: 16 });
    expect(short.status === 'done' && short.reachedEnd).toBe(false);
    expect(Math.max(...short.points.map((p) => p.px[0]))).toBeLessThan(202);
  });

  it('goes straight through a crossing without asking', async () => {
    const img = canvas(600, 300);
    const a = curve((x) => 50 + 0.4 * x, 20, 580);
    const b = curve((x) => 250 - 0.2 * x, 20, 580);
    stroke(img, a, 2.5, BLACK);
    stroke(img, b, 2.5, BLACK);
    const result = await traceGuided(img, { start: [40, 66], end: [560, 274] });
    expect(result.status).toBe('done');
    for (const p of result.points) expect(distanceTo(a, p.px)).toBeLessThan(1);
    expect(Math.max(...result.points.map((p) => p.px[0]))).toBeGreaterThan(550);
  });

  it('ignores light grid lines', async () => {
    const img = canvas(600, 300);
    for (let x = 30; x < 600; x += 40)
      stroke(
        img,
        [
          [x, 0],
          [x, 300],
        ],
        1.2,
        [200, 200, 200],
      );
    for (let y = 30; y < 300; y += 40)
      stroke(
        img,
        [
          [0, y],
          [600, y],
        ],
        1.2,
        [200, 200, 200],
      );
    const line = curve(wave, 20, 580);
    stroke(img, line, 2.5, BLACK);
    const result = await traceGuided(img, { start: [60, wave(60)], end: [540, wave(540)] });
    expect(result.status).toBe('done');
    expect(rms(result.points.map((p) => distanceTo(line, p.px)))).toBeLessThan(0.25);
  });

  it('stops at a symmetric fork with both branches, and resumes along the chosen one', async () => {
    const img = canvas(500, 300);
    const t = Math.tan((30 * Math.PI) / 180);
    stroke(
      img,
      [
        [20, 150],
        [250, 150],
      ],
      2.5,
      BLACK,
    );
    stroke(
      img,
      [
        [250, 150],
        [480, 150 - 230 * t],
      ],
      2.5,
      BLACK,
    );
    stroke(
      img,
      [
        [250, 150],
        [480, 150 + 230 * t],
      ],
      2.5,
      BLACK,
    );
    const result = await traceGuided(img, { start: [40, 150] });
    expect(result.status).toBe('ambiguous');
    if (result.status !== 'ambiguous') return;
    expect(result.at[0]).toBeGreaterThan(225);
    expect(result.at[0]).toBeLessThan(255);
    expect(result.branches).toHaveLength(2);
    const down = result.branches.find((b) => b.direction[1] > 0);
    if (!down) throw new Error('no downward branch');
    const resumed = await traceGuided(img, { start: result.at, direction: down.direction });
    const last = resumed.points[resumed.points.length - 1];
    expect(last?.px[0]).toBeGreaterThan(470);
    expect(last?.px[1]).toBeGreaterThan(260);
  });

  it('reports progress up to 1, honours checkpoints and lets tick cancel', async () => {
    const img = canvas(1200, 300);
    stroke(img, curve(wave, 20, 1180), 3, BLACK);
    const fractions: number[] = [];
    let checkpoints = 0;
    await traceGuided(
      img,
      { start: [40, wave(40)], end: [1160, wave(1160)] },
      {
        tick: (f) => fractions.push(f),
        checkpoint: () => {
          checkpoints++;
          return Promise.resolve();
        },
      },
    );
    expect(fractions.every((f, i) => i === 0 || f >= (fractions[i - 1] ?? 0))).toBe(true);
    expect(fractions[fractions.length - 1]).toBe(1);
    expect(checkpoints).toBeGreaterThan(0);
    await expect(
      traceGuided(
        img,
        { start: [40, wave(40)] },
        {
          tick: () => {
            throw new Error('cancelled');
          },
        },
      ),
    ).rejects.toThrow('cancelled');
  });

  it('throws NoCurveError when nothing is near the start', async () => {
    const img = canvas(200, 200);
    stroke(
      img,
      [
        [10, 20],
        [190, 20],
      ],
      2,
      BLACK,
    );
    await expect(traceGuided(img, { start: [100, 150] })).rejects.toThrow(NoCurveError);
  });

  it('traces bright curves on a dark background', async () => {
    const img = canvas(600, 300, [30, 34, 39]);
    const line = curve(wave, 20, 580);
    stroke(img, line, 3, [76, 201, 240]);
    const result = await traceGuided(img, { start: [60, wave(60)], end: [540, wave(540)] });
    expect(rms(result.points.map((p) => distanceTo(line, p.px)))).toBeLessThan(0.2);
  });
});

describe('inkMap', () => {
  it('is 1 on the curve colour, 0 on paper and on a distant colour', () => {
    const img = canvas(5, 1);
    img.data.set([31, 119, 180, 255, 255, 127, 14, 255], 0);
    expect(paperColor(img)).toEqual([255, 255, 255]);
    const map = inkMap(img, BLUE);
    expect(Array.from(map.data)).toEqual([1, 0, 0, 0, 0]);
    expect(map.tolerance).toBeGreaterThan(12);
  });
});

describe('simplify', () => {
  it('keeps the vertices needed to stay within the tolerance', () => {
    expect(
      simplify(
        [
          [0, 0],
          [1, 0.1],
          [2, 0],
          [3, 2],
          [4, 4],
        ],
        0.5,
      ),
    ).toEqual([0, 2, 4]);
    expect(
      simplify(
        [
          [0, 0],
          [1, 1],
        ],
        0.5,
      ),
    ).toEqual([0, 1]);
  });
});
