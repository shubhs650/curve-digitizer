// Task 3.2: A7 on real digitizations. The guided trace and X-step outputs of every sample curve drawn from an A7
// family (power, exp, poly-3, piecewise) go through the sample's exact calibration into the fit recommendation,
// which must name that family. The unit fixtures (packages/fit) check A7 on synthetic noise; this checks it on
// the noise the tracers really leave.
//
// `npx vitest run --config vitest.samples.config.ts scripts/samples/fit.samples.test.ts --silent=false` prints each result.
import { recommendFits, spaceOfAxis } from '@cd/fit';
import { applyHomogeneous, fromAxis } from '@cd/math';
import { describe, expect, it } from 'vitest';
import { replayers, type Replayer } from './replayers.ts';
import { loadSample, sampleNames } from './sample.ts';
import type { OpKind } from './truth.ts';

const FAMILIES = new Set(['power', 'exp', 'poly', 'piecewise']);
const KINDS = ['trace', 'xStep'] as const satisfies readonly OpKind[];

for (const name of sampleNames()) {
  const sample = loadSample(name);
  const { truth } = sample;
  const axes = { x: truth.axes.x.type, y: truth.axes.y.type };
  const space = { x: spaceOfAxis(axes.x), y: spaceOfAxis(axes.y) };
  const ops = sample.ops.ops.filter(
    (op) =>
      (KINDS as readonly string[]).includes(op.kind) &&
      'datasetId' in op &&
      FAMILIES.has(truth.datasets.find((d) => d.id === op.datasetId)?.model.family ?? ''),
  );
  if (ops.length === 0) continue;
  describe(`A7 fit recommendation on ${name}`, () => {
    for (const op of ops) {
      it(op.id, async () => {
        const family = truth.datasets.find((d) => 'datasetId' in op && d.id === op.datasetId)?.model.family;
        const replayer = replayers[op.kind] as Replayer<OpKind>;
        const output = (await replayer(op, sample)) as { readonly points: readonly (readonly [number, number])[] };
        const values = output.points.map((px) => {
          const [u, v] = applyHomogeneous(truth.pxToAxis, px);
          return [fromAxis(u, axes.x), fromAxis(v, axes.y)] as const;
        });
        const { fits, recommended } = recommendFits(
          values.map((p) => p[0]),
          values.map((p) => p[1]),
          space,
        );
        const fit = fits[recommended];
        const degree = fit?.model === 'poly' ? ` degree ${String((fit.params.c as readonly number[]).length - 1)}` : '';
        console.log(
          `${name} ${op.id}: ${String(values.length)} points → ${String(fit?.model)}${degree} ` +
            `(R² ${String(fit?.stats.r2.toFixed(6))}), truth ${String(family)}`,
        );
        // The family, as A7 asks. The degree is not checked here: traced points sit within ~0.1 px of the drawn
        // centreline, so the anti-aliased stroke's own sub-pixel bias is resolvable and can earn a degree or two
        // more (Pump A's X-step gives degree 5 with negligible high-order terms).
        expect(fit?.model).toBe(family);
      });
    }
  });
}
