import { addDataset, type Dataset, type Point, setCalibration, type Vec2 } from '@cd/core';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { EMPTY_DRAFT, evaluateDraft } from '../calibration/draft';
import type { CanvasPointer } from '../canvas/tools';
import { useActiveGraph, WorkspaceProvider } from '../session/context';
import { workspaceWithGraph } from '../test/workspace';
import { useUiStore } from '../ui/uiStore';
import type { PixelSource } from './pixels';
import { usePointTools } from './usePointTools';

afterEach(() => {
  cleanup();
  useUiStore.setState({ activeGraphId: null, activeDatasetIds: {}, selection: new Set(), snap: true });
});

/** A 200 × 100 white image with a 3 px dark horizontal stroke centred on y = 40.3. */
const STROKE_Y = 40.3;
const PIXELS: PixelSource = (x0, y0, width, height) => {
  const left = Math.max(0, x0);
  const top = Math.max(0, y0);
  const w = Math.min(200, x0 + width) - left;
  const h = Math.min(100, y0 + height) - top;
  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const centre = top + y + 0.5;
    // Exact coverage of the pixel row by the band [STROKE_Y − 1.5, STROKE_Y + 1.5].
    const covered = Math.max(
      0,
      Math.min(centre + 0.5, STROKE_Y + 1.5) - Math.max(centre - 0.5, STROKE_Y - 1.5),
    );
    data.fill(Math.round(255 - 200 * covered), y * w, (y + 1) * w);
  }
  return { raster: { width: w, height: h, channels: 1, data }, origin: [left, top] };
};

const point = (id: string, px: Vec2): Point => ({
  id,
  px,
  value: [0, 0],
  sigma: [0, 0],
  excludedFromFit: false,
  outOfRange: false,
  origin: 'manual',
});

const DATASET: Dataset = {
  id: 'd1',
  name: 'Curve',
  color: '#0072b2',
  mode: 'function',
  xUnit: '',
  yUnit: '',
  sourceRef: '',
  notes: '',
  points: [point('p1', [20, 20]), point('p2', [60, 70.5])],
};

async function setup({ withDataset = true } = {}) {
  const workspace = await workspaceWithGraph();
  const store = workspace.state.store;
  if (!store) throw new Error('no project');
  const graphId = store.project.graphs[0]?.id ?? '';
  if (withDataset) store.dispatch(addDataset(graphId, DATASET));
  const wrapper = ({ children }: { children: ReactNode }) => (
    <WorkspaceProvider workspace={workspace}>{children}</WorkspaceProvider>
  );
  const hook = renderHook(
    () => {
      const graph = useActiveGraph();
      if (!graph) throw new Error('no graph');
      return { graph, tools: usePointTools(graph, PIXELS) };
    },
    { wrapper },
  );
  const current = () => hook.result.current;
  const points = (datasetIndex = 0) => current().graph.datasets[datasetIndex]?.points ?? [];
  const pointer = (image: Vec2, extra: Partial<CanvasPointer> = {}): CanvasPointer => ({
    image,
    screen: image,
    scale: 1,
    hit: null,
    shiftKey: false,
    ctrlKey: false,
    ...extra,
  });
  const hitOn = (id: string, extra: Partial<CanvasPointer> = {}) => {
    const p = points().find((q) => q.id === id);
    if (!p) throw new Error(`no point ${id}`);
    return pointer(p.px, {
      hit: { key: `d1/${id}`, datasetId: 'd1', pointId: id, px: p.px, color: '#000' },
      ...extra,
    });
  };
  const key = (k: string, extra: KeyboardEventInit = {}): boolean => {
    let handled = false;
    act(() => {
      handled =
        current().tools.select.onKeyDown?.(new KeyboardEvent('keydown', { key: k, ...extra })) ?? false;
    });
    return handled;
  };
  const selection = () => [...useUiStore.getState().selection].sort();
  return { store, graphId, current, points, pointer, hitOn, key, selection };
}

describe('usePointTools: adding', () => {
  it('adds a snapped point to the active dataset and selects it', async () => {
    const { current, points, pointer, selection, store } = await setup();
    act(() => {
      current().tools.point.onDown?.(pointer([100.2, 37]));
    });
    const added = points()[2];
    expect(added?.origin).toBe('snap');
    expect(added?.px[1]).toBeCloseTo(STROKE_Y, 1);
    expect(added?.px[0]).toBeCloseTo(100.5, 6);
    expect(added?.lineWidthPx).toBeGreaterThan(2.5);
    expect(selection()).toEqual([`d1/${added?.id ?? ''}`]);
    expect(store.canUndo).toBe(true);
  });

  it('places at the click when snap is off or nothing is in reach', async () => {
    const { current, points, pointer } = await setup();
    act(() => {
      current().tools.point.onDown?.(pointer([30.25, 90]));
    });
    expect(points()[2]).toMatchObject({ px: [30.25, 90], origin: 'manual' });
    expect(points()[2]?.lineWidthPx).toBeUndefined();
    act(() => {
      useUiStore.getState().toggleSnap();
    });
    act(() => {
      current().tools.point.onDown?.(pointer([30, 38]));
    });
    expect(points()[3]).toMatchObject({ px: [30, 38], origin: 'manual' });
  });

  it('creates a dataset for the first point', async () => {
    const { current, pointer } = await setup({ withDataset: false });
    act(() => {
      current().tools.point.onDown?.(pointer([30, 90]));
    });
    expect(current().graph.datasets.map((d) => [d.name, d.points.length])).toEqual([['Dataset 1', 1]]);
  });

  it('computes calibrated values for a calibrated graph', async () => {
    const { current, pointer, store, graphId, points } = await setup();
    const evaluation = evaluateDraft({
      ...EMPTY_DRAFT,
      picks: [
        [0, 100],
        [200, 100],
        [0, 100],
        [0, 0],
      ],
      values: { x1: '0', x2: '20', y1: '0', y2: '10', xAxisAt: '0', yAxisAt: '0' },
    });
    if (evaluation.status !== 'ok') throw new Error('expected a calibration');
    act(() => {
      store.dispatch(setCalibration(graphId, evaluation.calibration));
    });
    act(() => {
      current().tools.point.onDown?.(pointer([150, 90]));
    });
    expect(points()[2]?.value[0]).toBeCloseTo(15, 9);
    expect(points()[2]?.value[1]).toBeCloseTo(1, 9);
    expect(points()[2]?.sigma[0]).toBeGreaterThan(0);
  });
});

describe('usePointTools: selecting and moving', () => {
  it('selects on click, toggles with Shift, and selects all with Ctrl+A', async () => {
    const { current, hitOn, selection, key } = await setup();
    act(() => {
      current().tools.select.onDown?.(hitOn('p1'));
    });
    act(() => {
      current().tools.select.onUp?.(hitOn('p1'));
    });
    expect(selection()).toEqual(['d1/p1']);
    act(() => {
      current().tools.select.onDown?.(hitOn('p2', { shiftKey: true }));
    });
    expect(selection()).toEqual(['d1/p1', 'd1/p2']);
    act(() => {
      current().tools.select.onDown?.(hitOn('p1', { ctrlKey: true }));
    });
    expect(selection()).toEqual(['d1/p2']);
    expect(key('Escape')).toBe(true);
    expect(selection()).toEqual([]);
    expect(key('a', { ctrlKey: true })).toBe(true);
    expect(selection()).toEqual(['d1/p1', 'd1/p2']);
  });

  it('box-selects points inside a dragged rectangle', async () => {
    const { current, pointer, selection } = await setup();
    act(() => {
      expect(current().tools.select.onDown?.(pointer([10, 10]))).toBe(true);
    });
    act(() => {
      current().tools.select.onDrag?.(pointer([30, 30]));
    });
    expect(current().tools.marquee).toEqual({ from: [10, 10], to: [30, 30] });
    act(() => {
      current().tools.select.onUp?.(pointer([30, 30]));
    });
    expect(selection()).toEqual(['d1/p1']);
    expect(current().tools.marquee).toBeNull();
  });

  it('drags the selection as one undo step and re-snaps a single point on drop', async () => {
    const { current, hitOn, pointer, points, store } = await setup();
    act(() => {
      current().tools.select.onDown?.(hitOn('p2'));
    });
    for (const y of [60, 50, 42]) {
      act(() => {
        current().tools.select.onDrag?.(pointer([65, y]));
      });
    }
    act(() => {
      current().tools.select.onUp?.(pointer([65, 42]));
    });
    expect(points()[1]?.origin).toBe('snap');
    expect(points()[1]?.px[1]).toBeCloseTo(STROKE_Y, 1);
    act(() => {
      store.undo();
    });
    expect(points()[1]?.px).toEqual([60, 70.5]);
  });

  it('nudges by 1 px or 0.1 px with Shift, one undo step per run', async () => {
    const { current, hitOn, key, points, store } = await setup();
    act(() => {
      current().tools.select.onDown?.(hitOn('p1'));
    });
    key('ArrowRight');
    key('ArrowRight');
    key('ArrowUp', { shiftKey: true });
    expect(points()[0]?.px[0]).toBe(22);
    expect(points()[0]?.px[1]).toBeCloseTo(19.9, 12);
    act(() => {
      store.undo();
    });
    expect(points()[0]?.px).toEqual([20, 20]);
  });

  it('deletes the selection; undo puts it back', async () => {
    const { current, hitOn, key, points, store, selection } = await setup();
    expect(key('Delete')).toBe(false);
    act(() => {
      current().tools.select.onDown?.(hitOn('p1'));
    });
    expect(key('Delete')).toBe(true);
    expect(points().map((p) => p.id)).toEqual(['p2']);
    expect(selection()).toEqual([]);
    act(() => {
      store.undo();
    });
    expect(points().map((p) => p.id)).toEqual(['p1', 'p2']);
  });
});
