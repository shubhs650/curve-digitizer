import { describe, expect, it } from 'vitest';
import { sampleProject } from '../testing.ts';
import type { Calibration } from '../types.ts';
import { CommandError } from './command.ts';
import { pointValuesOf, setCalibration } from './calibration.ts';

const g1 = () => {
  const graph = sampleProject().graphs[0];
  if (!graph?.calibration) throw new Error('fixture graph g1 has a calibration');
  return { graph, calibration: graph.calibration };
};

describe('setCalibration', () => {
  it('replaces the calibration and the named points’ caches, and inverts', () => {
    const before = sampleProject();
    const { calibration } = g1();
    const next: Calibration = { ...calibration, model: 'projective', residualPx: 0.2 };
    const command = setCalibration('g1', next, new Map([['p1', { value: [1, 2], sigma: [0.1, 0.2] }]]));
    const after = command.apply(before);
    const graph = after.graphs[0];
    expect(graph?.calibration).toEqual(next);
    expect(graph?.datasets[0]?.points[0]).toMatchObject({ value: [1, 2], sigma: [0.1, 0.2] });
    expect(graph?.datasets[0]?.points[1]).toBe(before.graphs[0]?.datasets[0]?.points[1]);
    expect(after.graphs[1]).toBe(before.graphs[1]);
    expect(command.invert(before).apply(after)).toEqual(before);
  });

  it('clears a calibration and restores it on undo', () => {
    const before = sampleProject();
    const command = setCalibration('g1', null);
    const after = command.apply(before);
    expect(after.graphs[0]?.calibration).toBeNull();
    expect(command.label).toBe('Clear calibration');
    expect(command.invert(before).apply(after)).toEqual(before);
  });

  it('carries a coalesce key and rejects an unknown graph', () => {
    expect(setCalibration('g1', null, new Map(), 'k').coalesceKey).toBe('k');
    expect(() => setCalibration('nope', null).apply(sampleProject())).toThrow(CommandError);
  });
});

describe('pointValuesOf', () => {
  it('collects every point’s cache by id', () => {
    const { graph } = g1();
    const values = pointValuesOf(graph);
    expect([...values.keys()]).toEqual(['p1', 'p2']);
    expect(values.get('p1')?.value).toEqual(graph.datasets[0]?.points[0]?.value);
  });
});
