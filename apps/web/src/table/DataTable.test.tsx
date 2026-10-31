import { addDataset, type Dataset, type Point } from '@cd/core';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useActiveGraph, WorkspaceProvider } from '../session/context';
import { workspaceWithGraph } from '../test/workspace';
import { Notices } from '../ui/notices';
import { useUiStore } from '../ui/uiStore';
import { DataTable } from './DataTable';

afterEach(() => {
  cleanup();
  useUiStore.setState({ activeGraphId: null, activeDatasetIds: {}, selection: new Set() });
});

const point = (id: string, px: readonly [number, number]): Point => ({
  id,
  px,
  value: [0, 0],
  sigma: [0, 0],
  excludedFromFit: false,
  outOfRange: false,
  origin: 'manual',
});

const dataset = (id: string, name: string, points: readonly Point[]): Dataset => ({
  id,
  name,
  color: '#0072b2',
  mode: 'function',
  xUnit: '',
  yUnit: '',
  sourceRef: '',
  notes: '',
  points,
});

function Live() {
  const graph = useActiveGraph();
  return graph && <DataTable graph={graph} />;
}

async function setup(points = [point('p1', [10, 20]), point('p2', [30.5, 40.25])]) {
  const workspace = await workspaceWithGraph();
  const store = workspace.state.store;
  if (!store) throw new Error('no project');
  const graphId = store.project.graphs[0]?.id ?? '';
  store.dispatch(addDataset(graphId, dataset('d1', 'Pump A', points)));
  const user = userEvent.setup();
  render(
    <WorkspaceProvider workspace={workspace}>
      <Live />
      <Notices />
    </WorkspaceProvider>,
  );
  const grid = within(screen.getByRole('grid', { name: 'Points of Pump A' }));
  const pointsOf = () => store.project.graphs[0]?.datasets[0]?.points ?? [];
  return { store, graphId, user, grid, pointsOf };
}

const cell = (row: number, col: number) => {
  const element = document.querySelector<HTMLElement>(`[data-cell="${String(row)}:${String(col)}"]`);
  if (!element) throw new Error(`no cell ${String(row)}:${String(col)}`);
  return element;
};

describe('DataTable', () => {
  it('lists each point with its pixels, a residual placeholder, and no values before calibration', async () => {
    const { grid } = await setup();
    const rows = grid.getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(
      within(rows[0] as HTMLElement)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['#', 'X', 'Y', 'σx', 'σy', 'x px', 'y px', 'Origin', 'Excluded', 'Residual']);
    expect(
      within(rows[2] as HTMLElement)
        .getAllByRole('gridcell')
        .map((c) => c.textContent),
    ).toEqual(['2', '—', '—', '—', '—', '30.50', '40.25', 'manual', '', '—']);
    expect(screen.getByText(/2 points · calibrate to see values/)).toBeTruthy();
  });

  it('edits a pixel cell with Enter, rejects text that is not a number, and undoes', async () => {
    const { user, pointsOf, store } = await setup();
    cell(0, 5).focus();
    await user.keyboard('{Enter}');
    const editor = screen.getByLabelText('x px of point 1');
    expect((editor as HTMLInputElement).value).toBe('10');
    await user.clear(editor);
    await user.type(editor, 'abc{Enter}');
    expect(editor.getAttribute('aria-invalid')).toBe('true');
    await user.clear(editor);
    await user.type(editor, '12.5{Enter}');
    expect(pointsOf()[0]?.px).toEqual([12.5, 20]);
    // Enter moved to the row below.
    expect(document.activeElement).toBe(cell(1, 5));
    act(() => {
      store.undo();
    });
    expect(pointsOf()[0]?.px).toEqual([10, 20]);
  });

  it('starts editing when a digit is typed, and Escape cancels', async () => {
    const { user, pointsOf } = await setup();
    cell(1, 6).focus();
    await user.keyboard('7');
    expect(screen.getByLabelText<HTMLInputElement>('y px of point 2').value).toBe('7');
    await user.keyboard('{Escape}');
    expect(screen.queryByLabelText('y px of point 2')).toBeNull();
    expect(pointsOf()[1]?.px).toEqual([30.5, 40.25]);
  });

  it('moves between cells with the arrow keys and toggles exclusion with Space', async () => {
    const { user, pointsOf } = await setup();
    cell(0, 1).focus();
    await user.keyboard('{ArrowDown}{End}');
    expect(document.activeElement).toBe(cell(1, 9));
    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(cell(1, 8));
    await user.keyboard(' ');
    expect(pointsOf()[1]?.excludedFromFit).toBe(true);
    await user.click(screen.getByLabelText('Exclude point 2 from fits'));
    expect(pointsOf()[1]?.excludedFromFit).toBe(false);
  });

  it('selects points by row and shows the canvas selection', async () => {
    const { user, grid } = await setup();
    await user.click(cell(1, 0));
    expect([...useUiStore.getState().selection]).toEqual(['d1/p2']);
    await user.keyboard('{Shift>}');
    await user.click(cell(0, 0));
    await user.keyboard('{/Shift}');
    expect([...useUiStore.getState().selection].sort()).toEqual(['d1/p1', 'd1/p2']);
    act(() => {
      useUiStore.getState().setSelection(new Set(['d1/p1']));
    });
    expect(grid.getAllByRole('row').map((r) => r.getAttribute('aria-selected'))).toEqual([
      null,
      'true',
      'false',
    ]);
  });

  it('copies the table, or the selected rows with Ctrl+C, as tab-separated text', async () => {
    const { user } = await setup();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await user.click(screen.getByRole('button', { name: 'Copy table' }));
    expect(writeText).toHaveBeenLastCalledWith(
      'X\tY\tσx\tσy\tx px\ty px\tOrigin\tExcluded\r\n\t\t\t\t10\t20\tmanual\tFALSE\r\n\t\t\t\t30.5\t40.25\tmanual\tFALSE\r\n',
    );
    expect(await screen.findByText('Copied 2 rows')).toBeTruthy();

    await user.click(cell(1, 0));
    await user.keyboard('{Control>}c{/Control}');
    expect(writeText).toHaveBeenLastCalledWith(
      'X\tY\tσx\tσy\tx px\ty px\tOrigin\tExcluded\r\n\t\t\t\t30.5\t40.25\tmanual\tFALSE\r\n',
    );
  });

  it('renders only the rows in view of a long dataset', async () => {
    const many = Array.from({ length: 5000 }, (_, i) => point(`p${String(i)}`, [i, i]));
    const { grid } = await setup(many);
    expect(screen.getByRole('grid').getAttribute('aria-rowcount')).toBe('5001');
    expect(grid.getAllByRole('row').length).toBeLessThan(60);
  });
});
