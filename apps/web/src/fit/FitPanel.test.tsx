import { addDataset, insertPoints, setCalibration } from '@cd/core';
import { recommendFits } from '@cd/fit';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { EMPTY_DRAFT, evaluateDraft } from '../calibration/draft';
import { newDataset } from '../inspector/DatasetsPanel';
import { placePoint } from '../points/cache';
import { workspaceWithGraph } from '../test/workspace';
import { useUiStore } from '../ui/uiStore';
import { fitInputs } from './fitInputs';
import { shownCandidates, specFrom } from './FitPanel';
import { useFitStore } from './fitStore';

afterEach(() => {
  cleanup();
  useFitStore.setState({ session: null });
  useUiStore.setState({
    activeGraphId: null,
    activeDatasetIds: {},
    selection: new Set(),
    tool: 'select',
    dockTab: 'table',
  });
});

async function setup() {
  const workspace = await workspaceWithGraph();
  const store = workspace.state.store;
  if (!store) throw new Error('no project');
  const user = userEvent.setup();
  render(<App workspace={workspace} />);
  const graph = () => {
    const g = store.project.graphs[0];
    if (!g) throw new Error('expected a graph');
    return g;
  };
  const dock = () => within(screen.getByRole('region', { name: 'Data dock' }));
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
      store.dispatch(setCalibration(graph().id, evaluation.calibration));
    });
  };
  /** A dataset of points on y = 0.5 + 0.02·x² (x 1…15). */
  const addCurve = () => {
    const g = graph();
    const d = newDataset(g, 'd1');
    act(() => {
      store.dispatch(addDataset(g.id, d));
      store.dispatch(
        insertPoints(
          g.id,
          Array.from({ length: 15 }, (_, i) => {
            const x = i + 1;
            const y = 0.5 + 0.02 * x * x;
            return {
              datasetId: d.id,
              point: placePoint(g, { px: [x * 10, 100 - y * 10], origin: 'manual' }, { id: `p${String(i)}` }),
            };
          }),
        ),
      );
    });
    return d.id;
  };
  return { store, user, graph, dock, calibrate, addCurve };
}

describe('FitPanel', () => {
  it('is a tab of the data dock that says what it needs', async () => {
    const { user, dock, calibrate } = await setup();
    await user.click(dock().getByRole('tab', { name: 'Fit' }));
    expect(dock().getByRole('note').textContent).toMatch(/Add a dataset/);
    calibrate();
    expect(dock().getByRole('note').textContent).toMatch(/Add a dataset|at least 3 points/);
  });

  it('lists the recommendation first, previews it, and stores the accepted fit', async () => {
    const { store, user, graph, dock, calibrate, addCurve } = await setup();
    calibrate();
    const datasetId = addCurve();
    await user.click(dock().getByRole('tab', { name: 'Fit' }));
    expect(dock().getByText(/15 points/)).toBeTruthy();
    const g = graph();
    const dataset = g.datasets[0];
    if (!dataset) throw new Error('expected a dataset');
    const inputs = fitInputs(g, dataset);
    const result = recommendFits(inputs.x, inputs.y, inputs.space);
    act(() => {
      useFitStore.setState({
        session: {
          graphId: g.id,
          datasetId,
          running: false,
          fraction: 1,
          result,
          spec: undefined,
          error: null,
          previewIndex: result.recommended,
        },
      });
    });
    const list = dock().getByRole('radiogroup', { name: 'Recommended fits' });
    const options = within(list).getAllByRole('radio');
    expect(options).toHaveLength(3);
    expect(options[0]?.closest('.fui-Radio')?.textContent).toMatch(/Polynomial, degree 2.*Recommended/);
    expect(dock().getByRole('img', { name: /Residuals of Polynomial, degree 2: 15 points/ })).toBeTruthy();
    await user.click(dock().getByRole('button', { name: 'Use this fit' }));
    const fit = store.project.graphs[0]?.fits.find((f) => f.datasetId === datasetId);
    expect(fit).toMatchObject({ model: 'poly', recommended: true });
    expect(fit?.params.c).toHaveLength(3);
    expect(useFitStore.getState().session).toBeNull();
    const current = dock().getByRole('status', { name: 'Current fit' });
    expect(current.textContent).toMatch(/Polynomial, degree 2 · R² 1 /);
    // The residual column of the table now has numbers.
    await user.click(dock().getByRole('tab', { name: 'Table' }));
    expect(
      dock()
        .getAllByRole('gridcell')
        .some((c) => /^-?\d/.test(c.textContent) && c.getAttribute('aria-colindex') === '10'),
    ).toBe(true);
    await user.click(dock().getByRole('tab', { name: 'Fit' }));
    await user.click(dock().getByRole('button', { name: 'Remove fit' }));
    expect(store.project.graphs[0]?.fits).toEqual([]);
    act(() => {
      store.undo();
    });
    expect(store.project.graphs[0]?.fits).toHaveLength(1);
  });

  it('flags a fit whose points changed', async () => {
    const { store, user, graph, dock, calibrate, addCurve } = await setup();
    calibrate();
    addCurve();
    await user.click(dock().getByRole('tab', { name: 'Fit' }));
    const g = graph();
    const dataset = g.datasets[0];
    if (!dataset) throw new Error('expected a dataset');
    const inputs = fitInputs(g, dataset);
    const result = recommendFits(inputs.x, inputs.y, inputs.space);
    act(() => {
      useFitStore.setState({
        session: {
          graphId: g.id,
          datasetId: dataset.id,
          running: false,
          fraction: 1,
          result,
          spec: undefined,
          error: null,
          previewIndex: 0,
        },
      });
    });
    await user.click(dock().getByRole('button', { name: 'Use this fit' }));
    expect(dock().queryByText(/points changed/)).toBeNull();
    act(() => {
      store.dispatch(
        insertPoints(g.id, [
          {
            datasetId: dataset.id,
            point: placePoint(graph(), { px: [190, 10], origin: 'manual' }, { id: 'extra' }),
          },
        ]),
      );
    });
    expect(dock().getByText(/points changed since this fit/)).toBeTruthy();
  });

  it('shows the stored fit as code in six languages, to copy', async () => {
    const { user, graph, dock, calibrate, addCurve } = await setup();
    calibrate();
    addCurve();
    await user.click(dock().getByRole('tab', { name: 'Fit' }));
    const g = graph();
    const dataset = g.datasets[0];
    if (!dataset) throw new Error('expected a dataset');
    const inputs = fitInputs(g, dataset);
    act(() => {
      useFitStore.setState({
        session: {
          graphId: g.id,
          datasetId: dataset.id,
          running: false,
          fraction: 1,
          result: recommendFits(inputs.x, inputs.y, inputs.space),
          spec: undefined,
          error: null,
          previewIndex: 0,
        },
      });
    });
    await user.click(dock().getByRole('button', { name: 'Use this fit' }));
    await user.click(dock().getByRole('button', { name: 'Code' }));
    const dialog = within(screen.getByRole('dialog', { name: 'Code for Dataset 1' }));
    expect(dialog.getAllByRole('tab')).toHaveLength(6);
    for (const name of ['Python', 'JavaScript', 'Excel formula', 'VBA', 'MATLAB', 'C/C++'])
      expect(dialog.getByRole('tab', { name })).toBeTruthy();
    expect(dialog.getByRole('region', { name: 'Python code' }).textContent).toMatch(/def dataset_1\(x\):/);

    await user.click(dialog.getByRole('tab', { name: 'Excel formula' }));
    const cell = dialog.getByRole('textbox', { name: 'X value cell' });
    await user.clear(cell);
    await user.type(cell, 'b7');
    const formula = dialog.getByRole('region', { name: 'Excel formula code' }).textContent;
    expect(formula).toMatch(/^=.*B7/);

    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await user.click(dialog.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledWith(formula.trimEnd());
    await user.click(dialog.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('refuses path datasets', async () => {
    const { store, user, graph, dock, calibrate } = await setup();
    calibrate();
    act(() => {
      store.dispatch(addDataset(graph().id, { ...newDataset(graph(), 'loop'), mode: 'path' }));
    });
    await user.click(dock().getByRole('tab', { name: 'Fit' }));
    expect(dock().getByRole('note').textContent).toMatch(/is a path dataset/);
  });
});

describe('model picker helpers', () => {
  it('parses the option for each model', () => {
    expect(specFrom('poly', '')).toEqual({ model: 'poly', degree: 3 });
    expect(specFrom('poly', '9')).toEqual({ model: 'poly', degree: 9 });
    expect(specFrom('poly', '10')).toBeNull();
    expect(specFrom('rational', '2/1')).toEqual({ model: 'rational', num: 2, den: 1 });
    expect(specFrom('rational', 'x')).toBeNull();
    expect(specFrom('spline', 'auto')).toEqual({ model: 'spline', knots: 'auto' });
    expect(specFrom('pchip', '6')).toEqual({ model: 'pchip', knots: 6 });
    expect(specFrom('piecewise', '2, 5.5')).toEqual({ model: 'piecewise', breakpoints: [2, 5.5] });
    expect(specFrom('piecewise', '')).toEqual({ model: 'piecewise', breakpoints: 'auto' });
    expect(specFrom('power', 'ignored')).toEqual({ model: 'power' });
  });

  it('shows the recommendation, then the lowest AICc others, three in all', () => {
    const fits = [0, 1, 2, 3, 4].map(() => ({}) as never);
    expect(shownCandidates(fits, 3)).toEqual([3, 0, 1]);
    expect(shownCandidates(fits, 0)).toEqual([0, 1, 2]);
    expect(shownCandidates(fits.slice(0, 2), 1)).toEqual([1, 0]);
  });
});
