import { addDataset, setCalibration } from '@cd/core';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { newDataset } from '../inspector/DatasetsPanel';
import { EMPTY_DRAFT, evaluateDraft } from '../calibration/draft';
import { workspaceWithGraph } from '../test/workspace';
import { useUiStore } from '../ui/uiStore';
import { INITIAL_X_SETTINGS, useXStepStore } from './xstepStore';

afterEach(() => {
  cleanup();
  useXStepStore.setState({ session: null, settings: INITIAL_X_SETTINGS });
  useUiStore.setState({ activeGraphId: null, activeDatasetIds: {}, selection: new Set(), tool: 'select' });
});

async function setup() {
  const workspace = await workspaceWithGraph();
  const store = workspace.state.store;
  if (!store) throw new Error('no project');
  const user = userEvent.setup();
  render(<App workspace={workspace} />);
  const panel = () => within(screen.getByRole('region', { name: 'X-step' }));
  const graph = () => store.project.graphs[0];
  const calibrate = () => {
    // x: px 0 → 0, px 200 → 20; y: px 100 → 0, px 0 → 10.
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
      store.dispatch(setCalibration(graph()?.id ?? '', evaluation.calibration));
    });
  };
  return { store, user, panel, graph, calibrate };
}

describe('XStepPanel', () => {
  it('waits for a calibration', async () => {
    const { panel } = await setup();
    expect(panel().getByText(/Calibrate the graph first/)).toBeTruthy();
  });

  it('refuses a path dataset, which has no single Y per X', async () => {
    const { store, panel, graph, calibrate } = await setup();
    calibrate();
    const g = graph();
    if (!g) throw new Error('expected a graph');
    act(() => {
      store.dispatch(addDataset(g.id, { ...newDataset(g, 'loop'), mode: 'path' }));
    });
    expect(panel().getByText(/^X-step needs a function dataset; .+ is a path\./)).toBeTruthy();
    expect(panel().queryByRole('button', { name: 'X-step (X)' })).toBeNull();
  });

  it('counts the X values from a step or a list, and offers the tool', async () => {
    const { user, panel, calibrate } = await setup();
    calibrate();
    await user.type(panel().getByRole('textbox', { name: 'From' }), '0');
    await user.type(panel().getByRole('textbox', { name: 'To' }), '10');
    await user.type(panel().getByRole('textbox', { name: 'Step' }), '2.5');
    expect(panel().getByText('5 X values')).toBeTruthy();
    await user.clear(panel().getByRole('textbox', { name: 'Step' }));
    await user.type(panel().getByRole('textbox', { name: 'Step' }), '0');
    expect(panel().getByRole('alert').textContent).toBe('Step must be more than 0');
    await user.click(panel().getByRole('radio', { name: 'List' }));
    await user.type(panel().getByRole('textbox', { name: /X values/ }), '1, 2, 4, 8');
    expect(panel().getByText('4 X values')).toBeTruthy();
    await user.click(panel().getByRole('button', { name: 'X-step (X)' }));
    expect(useUiStore.getState().tool).toBe('xstep');
    expect(panel().getByText('Click the curve to sample.')).toBeTruthy();
  });

  it('reports the result and adds the points, outliers excluded from fits, as one undo step', async () => {
    const { store, user, panel, graph, calibrate } = await setup();
    calibrate();
    act(() => {
      useXStepStore.setState({
        session: {
          graphId: graph()?.id ?? '',
          start: [10, 50],
          running: false,
          fraction: 1,
          error: null,
          result: {
            color: [255, 127, 14],
            path: [],
            stoppedAtBranch: false,
            points: [
              { x: 0, px: [0, 50], lineWidthPx: 3, outlier: false },
              { x: 5, px: [50, 20], lineWidthPx: 3, outlier: true },
              { x: 10, px: [100, 50], lineWidthPx: 3, outlier: false },
              { x: 15, px: null, lineWidthPx: 0, outlier: false },
            ],
          },
        },
      });
    });
    expect(panel().getByRole('status').textContent).toBe(
      '3 points, 1 outlier (red; added excluded from fits). The curve does not reach 1 X value.',
    );
    await user.click(panel().getByRole('button', { name: 'Add 3 points to a new dataset' }));
    const dataset = graph()?.datasets[0];
    expect(dataset?.color).toBe('#ff7f0e');
    expect(
      dataset?.points.map((p) => [p.origin, p.excludedFromFit, Math.round(p.value[0] * 1e6) / 1e6]),
    ).toEqual([
      ['xstep', false, 0],
      ['xstep', true, 5],
      ['xstep', false, 10],
    ]);
    expect(useXStepStore.getState().session).toBeNull();
    act(() => {
      store.undo();
    });
    expect(graph()?.datasets[0]?.points).toEqual([]);
  });
});
