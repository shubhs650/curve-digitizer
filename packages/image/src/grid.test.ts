import { describe, expect, it } from 'vitest';
import { detectGridLines, estimateLineAngle, inkMask } from './grid.ts';
import { darkness } from './raster.ts';
import { canvas, curve, stroke, type Pt } from './testing.ts';

const GREY: [number, number, number] = [150, 150, 150];
const INK: [number, number, number] = [0, 0, 0];

/** A 400 × 300 chart with a grid tilted by `deg`, and a sloping curve crossing it. */
function chart(deg: number) {
  const img = canvas(400, 300);
  const t = Math.tan((deg * Math.PI) / 180);
  for (let y = 30; y <= 270; y += 40)
    stroke(
      img,
      [
        [10, y],
        [390, y + 380 * t],
      ],
      1.5,
      GREY,
    );
  for (let x = 30; x <= 370; x += 40)
    stroke(
      img,
      [
        [x, 10],
        [x - 280 * t, 290],
      ],
      1.5,
      GREY,
    );
  const line = curve((x) => 60 + 0.002 * (x - 20) ** 2, 20, 380);
  stroke(img, line, 2.5, INK);
  return { img, line };
}

const inkOf = (img: ReturnType<typeof chart>['img']) => inkMask(darkness(img));

describe('estimateLineAngle', () => {
  it.each([0, 1.6, -2.3])('recovers a grid tilted by %s°', (deg) => {
    const ink = inkOf(chart(deg).img);
    const h = (estimateLineAngle(ink, 'horizontal') * 180) / Math.PI;
    const v = (estimateLineAngle(ink, 'vertical') * 180) / Math.PI;
    expect(h).toBeCloseTo(deg, 0);
    expect(Math.abs(h - deg)).toBeLessThan(0.15);
    // Vertical lines tilt the other way in (v, u) = (x, y) terms: x − y·tan θ.
    expect(Math.abs(v + deg)).toBeLessThan(0.15);
  });

  it('returns 0 for an empty mask', () => {
    expect(estimateLineAngle({ width: 4, height: 4, data: new Uint8Array(16) }, 'horizontal')).toBe(0);
  });
});

describe('detectGridLines', () => {
  it.each([0, 1.6])('flags the grid and spares the curve (tilt %s°)', (deg) => {
    const { img, line } = chart(deg);
    const ink = inkOf(img);
    const lines = detectGridLines(ink, { minRunPx: 150, tolerance: 2 });
    // Every curve pixel far from a grid line survives.
    const near = new Uint8Array(img.width * img.height);
    for (const p of line) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++)
          near[(Math.floor(p[1]) + dy) * img.width + Math.floor(p[0]) + dx] = 1;
      }
    }
    const onCurve = (p: Pt) => lines.data[Math.floor(p[1]) * img.width + Math.floor(p[0])];
    const spared = line.filter((p) => !onCurve(p)).length / line.length;
    // Only where the curve runs within a pixel or two of a grid line at a shallow angle can it lose pixels.
    expect(spared).toBeGreaterThan(0.9);
    // Most grid ink is flagged.
    let gridInk = 0;
    let flagged = 0;
    for (let i = 0; i < ink.data.length; i++) {
      if (!ink.data[i] || near[i]) continue;
      gridInk++;
      if (lines.data[i]) flagged++;
    }
    expect(flagged / gridInk).toBeGreaterThan(0.9);
  });

  it('keeps the pixels where a steep curve crosses a grid line', () => {
    const img = canvas(300, 200);
    stroke(
      img,
      [
        [5, 100],
        [295, 100],
      ],
      1.5,
      GREY,
    );
    stroke(
      img,
      [
        [100, 10],
        [200, 190],
      ],
      3,
      INK,
    );
    const lines = detectGridLines(inkOf(img), { minRunPx: 100, tolerance: 1 });
    expect(lines.data[100 * 300 + 150]).toBe(0);
    expect(lines.data[100 * 300 + 60]).toBe(1);
  });

  it('counts faint grid lines as ink even next to black curves', () => {
    const img = canvas(200, 100);
    stroke(
      img,
      [
        [5, 50],
        [195, 50],
      ],
      1,
      [215, 215, 215],
    );
    stroke(
      img,
      [
        [20, 10],
        [180, 90],
      ],
      3,
      INK,
    );
    const ink = inkOf(img);
    expect(ink.data[50 * 200 + 150]).toBe(1);
    expect(ink.data[20 * 200 + 150]).toBe(0);
  });

  it('ignores runs shorter than minRunPx', () => {
    const img = canvas(300, 100);
    stroke(
      img,
      [
        [20, 50],
        [120, 50],
      ],
      1.5,
      GREY,
    );
    const lines = detectGridLines(inkOf(img), { minRunPx: 150, tolerance: 2 });
    expect(lines.data.some((v) => v === 1)).toBe(false);
  });
});
