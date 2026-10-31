// Task 2.7: the stroke widths the features measure, which set each point's uncertainty
// (σ = √(0.5² + (w/2)²) px, ARCHITECTURE §5), replayed on every sample and compared with the drawn width.
import { describe, expect, it } from 'vitest';
import { replayers, type Replayer } from './replayers.ts';
import { loadSample, sampleNames } from './sample.ts';
import type { OpKind } from './truth.ts';

/** The median measured width must be within this of the drawn width (px). */
const MEDIAN_TOLERANCE_PX = 0.5;
/** Every single width must be within these factors of the drawn width (crossings, dashes and tilt included). */
const MIN_FACTOR = 0.5;
const MAX_FACTOR = 2;

const KINDS = ['manualPick', 'trace', 'colourMask', 'xStep'] as const satisfies readonly OpKind[];

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length / 2;
  return sorted.length % 2 ? (sorted[Math.floor(mid)] ?? NaN) : ((sorted[mid - 1] ?? NaN) + (sorted[mid] ?? NaN)) / 2;
}

for (const name of sampleNames()) {
  const sample = loadSample(name);
  describe(`line widths on ${name}`, () => {
    for (const op of sample.ops.ops) {
      if (!(KINDS as readonly string[]).includes(op.kind) || !('datasetId' in op)) continue;
      it(op.id, async () => {
        const replayer = replayers[op.kind] as Replayer<OpKind>;
        const output = (await replayer(op, sample)) as { readonly widths?: readonly number[] };
        const drawn = sample.truth.datasets.find((d) => d.id === op.datasetId)?.lineWidthPx ?? NaN;
        const widths = output.widths ?? [];
        const sorted = [...widths].sort((a, b) => a - b);
        const [min = NaN, max = NaN] = [sorted[0], sorted.at(-1)];
        console.log(
          `${name} ${op.id}: drawn ${String(drawn)} px, measured median ${median(widths).toFixed(2)}, ` +
            `range ${min.toFixed(2)}–${max.toFixed(2)} (${String(widths.length)} points)`,
        );
        expect(widths.length).toBeGreaterThan(0);
        expect(Math.abs(median(widths) - drawn)).toBeLessThanOrEqual(MEDIAN_TOLERANCE_PX);
        expect(min).toBeGreaterThanOrEqual(MIN_FACTOR * drawn);
        expect(max).toBeLessThanOrEqual(MAX_FACTOR * drawn);
      });
    }
  });
}
