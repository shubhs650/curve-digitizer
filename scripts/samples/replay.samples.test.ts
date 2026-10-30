// `pnpm test:samples`: checks every sample in samples/ against its own ground truth, then replays its recorded
// ops through the features that exist and scores them against docs/ACCEPTANCE_TARGETS.md. Ops whose feature has
// not landed yet are reported as todo, so the run stays green until a replayer is registered in replayers.ts.
import { describe, expect, it } from 'vitest';
import { applyMat3, pointAt, polyline, project } from './geometry.ts';
import { hexToRgb, strokeOffsets } from './ink.ts';
import { hasReplayer, limitFor, replay } from './replay.ts';
import { REPLAYER_TASKS } from './replayers.ts';
import { loadSample, missingFiles, sampleNames } from './sample.ts';
import { TARGETS } from './score.ts';
import { TARGET_IDS, type AxisType } from './truth.ts';

const names = sampleNames();

const toAxis = (type: AxisType, v: number): number => (type === 'log10' ? Math.log10(v) : v);

/** Ground-truth px are stored to 4 decimals. */
const PX_ROUNDING = 1e-3;
/** Probes of the rendered strokes must agree with the ground truth to these (px). */
const INK_MEDIAN_OFFSET_PX = 0.1;
const INK_P95_OFFSET_PX = 0.35;
const INK_PROBE_SPACING_PX = 3;
/** Probes this close to another curve, or to a line end, see more than one stroke. */
const INK_CLEARANCE_PX = 12;

function quantile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? NaN;
}

describe('samples/', () => {
  it('holds the four rev-0 samples (PRD §4.12)', () => {
    expect(names).toEqual(['dark-bg', 'scan-tilted', 'sn-family', 'vector-clean']);
  });

  it('records an op for every acceptance target and sample that test:samples verifies', () => {
    const recorded = new Set(
      names.flatMap((name) => loadSample(name).ops.ops.flatMap((op) => op.targets.map((t) => `${t} ${name}`))),
    );
    for (const id of TARGET_IDS) {
      for (const sample of Object.keys(TARGETS[id].limits)) expect(recorded).toContain(`${id} ${sample}`);
    }
  });
});

for (const name of names) {
  describe(name, () => {
    it('has every sample file', () => {
      expect(missingFiles(name)).toEqual([]);
    });

    const sample = loadSample(name);
    const { truth } = sample;

    it('declares the size source.png has', () => {
      const image = sample.image();
      expect([image.width, image.height]).toEqual([truth.image.width, truth.image.height]);
      expect(truth.sample).toBe(name);
    });

    it('has inverse transforms that map every tick to its value', () => {
      for (const p of [
        [0, 0],
        [truth.image.width, truth.image.height],
      ] as const) {
        const back = applyMat3(truth.axisToPx, applyMat3(truth.pxToAxis, p));
        expect(back[0]).toBeCloseTo(p[0], 6);
        expect(back[1]).toBeCloseTo(p[1], 6);
      }
      for (const tick of truth.ticks) {
        const along = toAxis(truth.axes[tick.axis].type, tick.value);
        const other = truth.axes[tick.axis === 'x' ? 'y' : 'x'];
        const across = toAxis(other.type, other.min);
        const expected = applyMat3(truth.axisToPx, tick.axis === 'x' ? [along, across] : [across, along]);
        expect(Math.hypot(expected[0] - tick.px[0], expected[1] - tick.px[1])).toBeLessThan(PX_ROUNDING);
      }
    });

    it('has dense centerlines inside the image, and exact samples on them', () => {
      for (const ds of truth.datasets) {
        const line = polyline(ds.centerline);
        for (const [i, p] of ds.centerline.entries()) {
          expect(p[0] > 0 && p[0] < truth.image.width && p[1] > 0 && p[1] < truth.image.height).toBe(true);
          const prev = ds.centerline[i - 1];
          if (prev) expect(Math.hypot(p[0] - prev[0], p[1] - prev[1])).toBeLessThanOrEqual(1.5);
        }
        expect(ds.samples).toHaveLength(25);
        for (const s of ds.samples) {
          expect(project(line, s.px).distance).toBeLessThan(0.01);
          const expected = applyMat3(truth.axisToPx, [
            toAxis(truth.axes.x.type, s.value[0]),
            toAxis(truth.axes.y.type, s.value[1]),
          ]);
          expect(Math.hypot(expected[0] - s.px[0], expected[1] - s.px[1])).toBeLessThan(PX_ROUNDING);
        }
      }
    });

    it('lists intersections that lie on both curves', () => {
      for (const c of truth.intersections) {
        for (const id of c.datasets) {
          const ds = truth.datasets.find((d) => d.id === id);
          expect(ds).toBeDefined();
          if (ds) expect(project(polyline(ds.centerline), c.px).distance).toBeLessThan(0.05);
        }
      }
    });

    it('renders every curve centred on its ground-truth centerline', () => {
      const image = sample.image();
      for (const ds of truth.datasets) {
        const line = polyline(ds.centerline);
        const others = truth.datasets.filter((d) => d.id !== ds.id).map((d) => polyline(d.centerline));
        const period = ds.dash ? ds.dash.reduce((a, b) => a + b, 0) : 0;
        const skip = (s: number): boolean => {
          if (s < INK_CLEARANCE_PX || s > line.length - INK_CLEARANCE_PX) return true;
          if (ds.dash) {
            // Keep only probes well inside a dash: stroke-dasharray starts with a dash at the first vertex.
            const phase = s % period;
            const on = ds.dash[0] ?? 0;
            if (phase < 2 || phase > on - 2) return true;
          }
          const p = pointAt(line, s);
          return others.some((o) => project(o, p).distance < INK_CLEARANCE_PX);
        };
        const probes = strokeOffsets(image, line, {
          ink: hexToRgb(ds.color),
          lineWidthPx: ds.lineWidthPx,
          spacingPx: INK_PROBE_SPACING_PX,
          skip,
        });
        const offsets = probes.map((p) => Math.abs(p.offset));
        expect(probes.length, `${ds.id} probes`).toBeGreaterThan(line.length / INK_PROBE_SPACING_PX / 4);
        expect(quantile(offsets, 0.5), `${ds.id} median offset`).toBeLessThan(INK_MEDIAN_OFFSET_PX);
        expect(quantile(offsets, 0.95), `${ds.id} 95th percentile offset`).toBeLessThan(INK_P95_OFFSET_PX);
      }
    });

    for (const op of sample.ops.ops) {
      for (const target of op.targets) {
        const title = `${target} ${op.id}`;
        it(`${title}: target applies to this sample`, () => {
          expect(TARGETS[target].opKind).toBe(op.kind);
          expect(() => limitFor(target, name)).not.toThrow();
        });
        if (hasReplayer(op.kind)) {
          it(`${title} (${TARGETS[target].summary})`, async () => {
            const result = await replay(sample, op, target);
            if (result.status !== 'scored') throw new Error(result.reason);
            console.log(`${name} ${title}: ${result.score.measured}`);
            expect(result.score.failures).toEqual([]);
          });
        } else {
          it.todo(`${title} (${TARGETS[target].summary}): waiting for task ${REPLAYER_TASKS[op.kind]}`);
        }
      }
    }
  });
}
