import { addDataset, insertPoints, setCalibration } from '@cd/core';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { EMPTY_DRAFT, evaluateDraft } from '../calibration/draft';
import { newDataset } from '../inspector/DatasetsPanel';
import { placePoint } from '../points/cache';
import { workspaceWithGraph } from '../test/workspace';
import { useUiStore } from '../ui/uiStore';
import { useCalcStore } from './calcStore';

afterEach(() => {
  cleanup();
  useCalcStore.setState({ text: '', compare: null });
  useUiStore.setState({ activeGraphId: null, activeDatasetIds: {}, selection: new Set(), dockTab: 'table' });
});

async function setup({ calibrated = true } = {}) {
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
  if (calibrated) {
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
  }
  /** A dataset through (x, f(x)) for x = 1…10. */
  const addCurve = (id: string, f: (x: number) => number) => {
    const g = graph();
    const d = newDataset(g, id);
    act(() => {
      store.dispatch(addDataset(g.id, d));
      store.dispatch(
        insertPoints(
          g.id,
          Array.from({ length: 10 }, (_, i) => ({
            datasetId: d.id,
            point: placePoint(
              g,
              { px: [(i + 1) * 10, 100 - f(i + 1) * 10], origin: 'manual' },
              { id: `${id}${String(i)}` },
            ),
          })),
        ),
      );
    });
  };
  const dock = () => within(screen.getByRole('region', { name: 'Data dock' }));
  return { user, addCurve, dock };
}

describe('CalculatorPanel', () => {
  it('asks for a calibration first', async () => {
    const { user, dock } = await setup({ calibrated: false });
    await user.click(dock().getByRole('tab', { name: 'Calculator' }));
    expect(dock().getByRole('note').textContent).toMatch(/Calibrate the graph first/);
  });

  it('reads every dataset at the typed X values, compares two and copies the table', async () => {
    const { user, addCurve, dock } = await setup();
    addCurve('a', (x) => 0.5 * x);
    addCurve('b', (x) => 0.25 * x + 1);
    await user.click(dock().getByRole('tab', { name: 'Calculator' }));
    await user.type(dock().getByRole('textbox', { name: /X values/ }), '2, 4.5 12');
    const rows = () =>
      within(dock().getByRole('table', { name: 'Calculated values' }))
        .getAllByRole('row')
        .map((r) => [...r.querySelectorAll('th, td')].map((c) => c.textContent));
    expect(rows()).toEqual([
      ['X', 'Dataset 1 · points', 'Dataset 2 · points'],
      ['2', '1', '1.5'],
      ['4.5', '2.25', '2.125'],
      ['12', '—', '—'],
    ]);

    await user.click(dock().getByRole('checkbox', { name: 'Compare' }));
    expect(rows()[0]).toEqual([
      'X',
      'Dataset 1 · points',
      'Dataset 2 · points',
      'Dataset 1 − Dataset 2',
      'Dataset 1 / Dataset 2',
    ]);
    expect(rows()[1]).toEqual(['2', '1', '1.5', '-0.5', '0.666667']);
    await user.selectOptions(dock().getByRole('combobox', { name: 'A' }), 'Dataset 2');
    await user.selectOptions(dock().getByRole('combobox', { name: 'B' }), 'Dataset 1');
    expect(rows()[1]).toEqual(['2', '1', '1.5', '0.5', '1.5']);

    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await user.click(dock().getByRole('button', { name: 'Copy results' }));
    // Full precision, so compare the numbers (they carry the calibration's round-off).
    const copied = (writeText.mock.calls[0] as unknown as [string])[0]
      .split('\r\n')
      .map((l) => l.split('\t'));
    expect(copied[0]).toEqual([
      'X',
      'Dataset 1',
      'Dataset 2',
      'Dataset 2 − Dataset 1',
      'Dataset 2 / Dataset 1',
    ]);
    const expected = [
      [2, 1, 1.5, 0.5, 1.5],
      [4.5, 2.25, 2.125, -0.125, 2.125 / 2.25],
    ];
    expected.forEach((row, i) => {
      row.forEach((v, j) => {
        expect(Number(copied[i + 1]?.[j])).toBeCloseTo(v, 12);
      });
    });
    expect(copied[3]).toEqual(['12', '', '', '', '']);
  });

  it('says which X value is not a number', async () => {
    const { user, addCurve, dock } = await setup();
    addCurve('a', (x) => x);
    await user.click(dock().getByRole('tab', { name: 'Calculator' }));
    await user.type(dock().getByRole('textbox', { name: /X values/ }), '3, abc');
    expect(dock().getByText('"abc" is not a number.')).toBeTruthy();
    expect(dock().queryByRole('table')).toBeNull();
  });
});
