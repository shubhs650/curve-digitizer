// `pnpm bench`: what each pre-processing filter and image map costs on a chart the size of vector-clean
// (2400 × 1600 px, 3.8 Mpx), median of a few runs. Not part of CI; run it before and after touching a filter.
// The compute worker runs these off the main thread, so the budget is preview latency, not long tasks.
import {
  applyStack,
  colorDistance,
  distanceTransform,
  FILTER_OP_NAMES,
  FILTER_OPS,
  type StepParams,
  thin,
} from '@cd/image';
import { canvas, curve, stroke } from '@cd/image/testing';

const img = canvas(2400, 1600, [245, 240, 225]);
for (let y = 100; y < 1600; y += 60)
  stroke(
    img,
    [
      [50, y],
      [2350, y + 20],
    ],
    1.2,
    [190, 190, 190],
  );
for (let x = 100; x < 2400; x += 60)
  stroke(
    img,
    [
      [x, 50],
      [x - 15, 1550],
    ],
    1.2,
    [190, 190, 190],
  );
stroke(
  img,
  curve((x) => 300 + 900 / (1 + Math.exp((x - 1500) / 150)), 200, 2300),
  3,
  [31, 119, 180],
);
stroke(
  img,
  curve((x) => 1400 - 0.0002 * (x - 200) ** 2, 200, 2300),
  3,
  [20, 20, 20],
);
const ink = { width: img.width, height: img.height, data: new Uint8Array(img.width * img.height) };
for (let i = 0; i < ink.data.length; i++) ink.data[i] = (img.data[i * 4] ?? 255) < 120 ? 1 : 0;

const noTick = () => undefined;
const PARAMS: Readonly<Record<string, StepParams>> = {
  brightness: { value: 0.1 },
  contrast: { value: 1.3, auto: true },
  despeckle: { radius: 1 },
  gridSuppress: { minRunPx: 800, tolerance: 2 },
  isolateColor: { color: '#1f77b4', tolerance: 25 },
};

async function time(label: string, fn: () => unknown, runs = 5): Promise<void> {
  await fn();
  const ms: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    await fn();
    ms.push(performance.now() - t0);
  }
  ms.sort((a, b) => a - b);
  console.log(`${label.padEnd(32)} ${(ms[Math.floor(runs / 2)] ?? 0).toFixed(1).padStart(8)} ms`);
}

console.log('Filters and maps on 2400 × 1600 px (median of 5)');
for (const name of FILTER_OP_NAMES) {
  const op = FILTER_OPS[name];
  const params = op.parse(PARAMS[name] ?? {});
  await time(name, () => op.apply(img, params as never, noTick));
}
await time('despeckle radius 3', () => FILTER_OPS.despeckle.apply(img, { radius: 3 }, noTick));
await time('Enhance for tracing preset', () =>
  applyStack(img, [
    { op: 'grayscale' },
    { op: 'despeckle', radius: 1 },
    { op: 'gridSuppress', minRunPx: 800, tolerance: 2 },
    { op: 'contrast', value: 1, auto: true },
  ]),
);
await time('colorDistance', () => colorDistance(img, [31, 119, 180]));
await time('distanceTransform', () => distanceTransform(ink));
await time('thin (Zhang–Suen)', () => thin(ink));
