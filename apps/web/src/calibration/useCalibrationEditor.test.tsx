import { addDataset, type Dataset, type Vec2 } from '@cd/core';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useActiveGraph, WorkspaceProvider } from '../session/context';
import { workspaceWithGraph } from '../test/workspace';
import type { PickIndex } from './draft';
import { resetCalibrationEditors, useCalibrationEditor } from './useCalibrationEditor';

afterEach(() => {
  cleanup();
  resetCalibrationEditors();
});

// vector-clean's calibration clicks (samples/vector-clean/ops.json): X = 10, 90 on y = 0; Y = 10, 50 on x = 0.
const CLICKS: readonly Vec2[] = [
  [412, 1450],
  [2108, 1450],
  [200, 1226.7],
  [200, 333.3],
];

const DATASET: Dataset = {
  id: 'd1',
  name: 'Curve',
  color: '#0072b2',
  mode: 'function',
  xUnit: '',
  yUnit: '',
  sourceRef: '',
  notes: '',
  points: [
    {
      id: 'p1',
      px: [1260, 780],
      value: [0, 0],
      sigma: [0, 0],
      excludedFromFit: false,
      outOfRange: false,
      origin: 'manual',
    },
  ],
};

async function setup() {
  const workspace = await workspaceWithGraph();
  const store = workspace.state.store;
  if (!store) throw new Error('no project');
  const graphId = store.project.graphs[0]?.id ?? '';
  store.dispatch(addDataset(graphId, DATASET));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <WorkspaceProvider workspace={workspace}>{children}</WorkspaceProvider>
  );
  const hook = renderHook(
    () => {
      const graph = useActiveGraph();
      if (!graph) throw new Error('no graph');
      return { graph, editor: useCalibrationEditor(graph) };
    },
    { wrapper },
  );
  const current = () => hook.result.current;
  const placeAll = () => {
    CLICKS.forEach((px, i) => {
      act(() => {
        current().editor.place(i as PickIndex, px);
      });
    });
  };
  const type = (values: Partial<Record<'x1' | 'x2' | 'y1' | 'y2' | 'xAxisAt' | 'yAxisAt', string>>) => {
    act(() => {
      current().editor.edit((d) => ({ ...d, values: { ...d.values, ...values } }));
    });
  };
  return { store, current, placeAll, type };
}

describe('useCalibrationEditor', () => {
  it('walks through the picks and saves once the draft solves', async () => {
    const { store, current, type } = await setup();
    expect(current().editor.active).toBe(0);
    type({ x1: '10', x2: '90', y1: '10', y2: '50' });
    expect(current().graph.calibration).toBeNull();
    const actives = CLICKS.map((px, i) => {
      act(() => {
        current().editor.place(i as PickIndex, px);
      });
      return current().editor.active;
    });
    expect(actives).toEqual([1, 2, 3, null]);

    const calibration = current().graph.calibration;
    expect(calibration?.points.map((p) => p.px)).toEqual(CLICKS);
    // Blank crossings are solved, so four clicks fit exactly.
    expect(calibration?.residualPx).toBeLessThan(1e-9);
    expect(current().editor.evaluation.status).toBe('ok');
    // Points get their calibrated values with the calibration.
    const point = current().graph.datasets[0]?.points[0];
    expect(point?.value[0]).toBeCloseTo(10 + ((1260 - 412) * 80) / 1696, 6);
    expect(point?.value[1]).toBeCloseTo(10 + ((1226.7 - 780) * 40) / 893.4, 6);
    expect(store.canUndo).toBe(true);
  });

  it('uses typed crossings and reports the residual of the clicks', async () => {
    const { current, placeAll, type } = await setup();
    placeAll();
    type({ x1: '10', x2: '90', y1: '10', y2: '50', xAxisAt: '0', yAxisAt: '0' });
    const calibration = current().graph.calibration;
    expect(calibration?.points.map((p) => p.axis)).toEqual([
      [10, 0],
      [90, 0],
      [0, 10],
      [0, 50],
    ]);
    // The ops clicks are rounded to 0.1 px (A1: ≤ 0.5 px).
    expect(calibration?.residualPx).toBeGreaterThan(0);
    expect(calibration?.residualPx).toBeLessThan(0.5);
  });

  it('keeps the last calibration while the draft is invalid', async () => {
    const { current, placeAll, type } = await setup();
    placeAll();
    type({ x1: '10', x2: '90', y1: '10', y2: '50' });
    const saved = current().graph.calibration;
    type({ x2: '9x' });
    expect(current().editor.evaluation.status).toBe('invalid');
    expect(current().editor.draft.values.x2).toBe('9x');
    expect(current().graph.calibration).toBe(saved);
  });

  it('follows undo and redo back into the draft', async () => {
    const { store, current, placeAll, type } = await setup();
    placeAll();
    type({ x1: '10', x2: '90', y1: '10', y2: '50' });
    type({ x2: '100' });
    expect(current().graph.calibration?.points[1]?.axis[0]).toBe(100);
    act(() => {
      store.undo();
    });
    expect(current().editor.draft.values.x2).toBe('90');
    act(() => {
      store.redo();
    });
    expect(current().editor.draft.values.x2).toBe('100');
  });

  it('clears the calibration but keeps the axes', async () => {
    const { current, placeAll, type } = await setup();
    placeAll();
    act(() => {
      current().editor.edit((d) => ({ ...d, xAxis: { type: 'log10', label: 'Time', unit: 's' } }));
    });
    type({ x1: '10', x2: '1000', y1: '10', y2: '50' });
    expect(current().graph.calibration?.xAxis.type).toBe('log10');
    // Log axes store log10 of the value.
    expect(current().graph.calibration?.points[1]?.axis[0]).toBeCloseTo(3, 12);
    act(() => {
      current().editor.clear();
    });
    expect(current().graph.calibration).toBeNull();
    expect(current().editor.draft.picks).toEqual([null, null, null, null]);
    expect(current().editor.draft.xAxis).toEqual({ type: 'log10', label: 'Time', unit: 's' });
    expect(current().editor.active).toBe(0);
  });

  it('drags a placed pick without changing which pick is next', async () => {
    const { current, type } = await setup();
    type({ x1: '10', x2: '90', y1: '10', y2: '50' });
    act(() => {
      current().editor.place(0, [400, 1450]);
    });
    expect(current().editor.active).toBe(1);
    act(() => {
      current().editor.place(0, [412, 1450], 'drag');
    });
    expect(current().editor.draft.picks[0]).toEqual([412, 1450]);
    expect(current().editor.active).toBe(1);
  });
});
