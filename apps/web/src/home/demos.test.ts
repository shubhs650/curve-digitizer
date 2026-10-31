import { describe, expect, it } from 'vitest';
import darkBgOps from '../../../../samples/dark-bg/ops.json?raw';
import darkBgTruth from '../../../../samples/dark-bg/ground-truth.json?raw';
import scanTiltedOps from '../../../../samples/scan-tilted/ops.json?raw';
import scanTiltedTruth from '../../../../samples/scan-tilted/ground-truth.json?raw';
import snFamilyOps from '../../../../samples/sn-family/ops.json?raw';
import snFamilyTruth from '../../../../samples/sn-family/ground-truth.json?raw';
import vectorCleanOps from '../../../../samples/vector-clean/ops.json?raw';
import vectorCleanTruth from '../../../../samples/vector-clean/ground-truth.json?raw';
import { evaluateDraft } from '../calibration/draft';
import { testWorkspace, TINY_PNG } from '../test/workspace';
import { DEMOS, demoDraft, openDemo } from './demos';

interface Ops {
  readonly ops: readonly {
    readonly kind: string;
    readonly points?: readonly { readonly px: [number, number]; readonly value: [number, number] }[];
  }[];
}

interface Truth {
  readonly axes: Record<'x' | 'y', { readonly type: string; readonly label: string; readonly unit?: string }>;
  readonly datasets: readonly {
    readonly name: string;
    readonly xUnit: string;
    readonly yUnit: string;
    readonly param?: unknown;
  }[];
}

const SAMPLES: Readonly<Record<string, { readonly ops: Ops; readonly truth: Truth }>> = {
  'vector-clean': { ops: JSON.parse(vectorCleanOps) as Ops, truth: JSON.parse(vectorCleanTruth) as Truth },
  'scan-tilted': { ops: JSON.parse(scanTiltedOps) as Ops, truth: JSON.parse(scanTiltedTruth) as Truth },
  'sn-family': { ops: JSON.parse(snFamilyOps) as Ops, truth: JSON.parse(snFamilyTruth) as Truth },
  'dark-bg': { ops: JSON.parse(darkBgOps) as Ops, truth: JSON.parse(darkBgTruth) as Truth },
};

describe('demo projects', () => {
  it('has one demo per sample, in step with its recorded calibration and ground truth', () => {
    expect(DEMOS.map((d) => d.sample).sort()).toEqual(Object.keys(SAMPLES).sort());
    for (const demo of DEMOS) {
      const sample = SAMPLES[demo.sample];
      if (!sample) throw new Error(demo.sample);
      const calibrate = sample.ops.ops.find((op) => op.kind === 'calibrate');
      expect(demo.picks, demo.sample).toEqual(calibrate?.points);
      const axis = (a: Truth['axes']['x']) => ({
        type: a.type,
        label: a.label,
        ...(a.unit ? { unit: a.unit } : {}),
      });
      expect(demo.xAxis, demo.sample).toEqual(axis(sample.truth.axes.x));
      expect(demo.yAxis, demo.sample).toEqual(axis(sample.truth.axes.y));
      expect(demo.datasets, demo.sample).toEqual(
        sample.truth.datasets.map(({ name, xUnit, yUnit, param }) => ({
          name,
          xUnit,
          yUnit,
          ...(param === undefined ? {} : { param }),
        })),
      );
    }
  });

  it('solves each calibration within a tenth of a pixel (the clicks are recorded to 0.1 px)', () => {
    for (const demo of DEMOS) {
      const evaluation = evaluateDraft(demoDraft(demo));
      if (evaluation.status !== 'ok') throw new Error(`${demo.sample}: ${evaluation.status}`);
      expect(evaluation.calibration.residualPx, demo.sample).toBeLessThan(0.1);
    }
  });

  it('opens a demo as a new, calibrated project with an empty dataset per curve', async () => {
    const workspace = testWorkspace();
    const demo = DEMOS.find((d) => d.sample === 'sn-family');
    if (!demo) throw new Error('sn-family');
    const urls: string[] = [];
    let n = 0;
    const graphId = await openDemo(workspace, demo, {
      fetchBytes: (url) => {
        urls.push(url);
        return Promise.resolve(TINY_PNG);
      },
      newId: () => `d${String(++n)}`,
    });
    expect(urls).toEqual([demo.imageUrl]);
    const project = workspace.state.store?.project;
    expect(project?.name).toBe('S-N curve family');
    const graph = project?.graphs.find((g) => g.id === graphId);
    expect(graph?.calibration?.xAxis).toEqual({ type: 'log10', label: 'Number of cycles N' });
    expect(graph?.calibration?.points.map((p) => p.axis)).toEqual([
      [2, 1],
      [6, 1],
      [1, 2],
      [1, 3],
    ]);
    expect(graph?.datasets.map((d) => [d.id, d.name, d.param?.value, d.points.length])).toEqual([
      ['d1', 'UTS 480 MPa', 480, 0],
      ['d2', 'UTS 690 MPa', 690, 0],
      ['d3', 'UTS 860 MPa', 860, 0],
    ]);
    expect(new Set(graph?.datasets.map((d) => d.color)).size).toBe(3);
    expect(workspace.state.projects.map((p) => p.name)).toEqual(['S-N curve family']);
  });

  it('opens nothing when the image does not load', async () => {
    const workspace = testWorkspace();
    const demo = DEMOS[0];
    if (!demo) throw new Error('no demos');
    await expect(
      openDemo(workspace, demo, {
        fetchBytes: () => Promise.reject(new Error('offline')),
        newId: () => 'x',
      }),
    ).rejects.toThrow('offline');
    expect(workspace.state.store).toBeNull();
  });
});
