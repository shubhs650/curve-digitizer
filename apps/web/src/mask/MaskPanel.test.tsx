import type { MaskComponent } from '@cd/trace';
import type { MaskCurvesResult } from '@cd/workers';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { workspaceWithGraph } from '../test/workspace';
import { useUiStore } from '../ui/uiStore';
import { useMaskStore } from './maskStore';

afterEach(() => {
  cleanup();
  useMaskStore.setState({ session: null });
  useUiStore.setState({ activeGraphId: null, activeDatasetIds: {}, selection: new Set(), tool: 'select' });
});

const component = (y: number, n: number): MaskComponent => ({
  path: Array.from({ length: n }, (_, i) => [i + 0.5, y] as const),
  points: Array.from({ length: Math.ceil(n / 5) }, (_, i) => ({
    px: [i * 5 + 0.5, y] as const,
    lineWidthPx: 3,
  })),
  lengthPx: n - 1,
  lineWidthPx: 3,
});

const result: MaskCurvesResult = {
  color: [31, 119, 180],
  tolerance: 32,
  picked: 0,
  components: [component(2.5, 40), component(6.5, 20)],
};

async function setup() {
  const workspace = await workspaceWithGraph();
  const store = workspace.state.store;
  if (!store) throw new Error('no project');
  const user = userEvent.setup();
  render(<App workspace={workspace} />);
  const panel = within(screen.getByRole('region', { name: 'Colour mask' }));
  const graph = () => store.project.graphs[0];
  return { store, user, panel, graph };
}

describe('MaskPanel', () => {
  it('offers the tool until a curve is picked', async () => {
    const { user, panel } = await setup();
    await user.click(panel.getByRole('button', { name: 'Colour mask (M)' }));
    expect(useUiStore.getState().tool).toBe('mask');
    expect(panel.getByText('Click a curve on the canvas to find every curve of its colour.')).toBeTruthy();
  });

  it('lists the components, keeps the picked one and adds the kept points as one undo step', async () => {
    const { store, user, panel, graph } = await setup();
    const graphId = graph()?.id ?? '';
    act(() => {
      useMaskStore.setState({
        session: {
          graphId,
          pick: [10, 2.5],
          color: result.color,
          tolerance: result.tolerance,
          running: false,
          fraction: 1,
          result,
          kept: new Set([0]),
          error: null,
        },
      });
    });
    expect(panel.getByText('Curve colour #1f77b4')).toBeTruthy();
    expect(panel.getByRole('slider', { name: /Colour tolerance/ })).toBeTruthy();
    const first = panel.getByRole<HTMLInputElement>('checkbox', { name: 'Curve 1, 39 px long' });
    const second = panel.getByRole<HTMLInputElement>('checkbox', { name: 'Curve 2, 19 px long' });
    expect(first.checked).toBe(true);
    expect(second.checked).toBe(false);
    await user.click(second);
    expect(useMaskStore.getState().session?.kept).toEqual(new Set([0, 1]));
    await user.click(panel.getByRole('button', { name: 'Add 12 points to a new dataset' }));
    const datasets = graph()?.datasets ?? [];
    expect(datasets).toHaveLength(1);
    expect(datasets[0]?.color).toBe('#1f77b4');
    const points = datasets[0]?.points ?? [];
    expect(points).toHaveLength(12);
    expect(points.every((p) => p.origin === 'trace' && p.lineWidthPx === 3)).toBe(true);
    expect(points.slice(0, 8).every((p) => p.px[1] === 2.5)).toBe(true);
    expect(useMaskStore.getState().session).toBeNull();
    act(() => {
      store.undo();
    });
    expect(graph()?.datasets[0]?.points).toEqual([]);
  });

  it('shows progress with Cancel while running, and errors', async () => {
    const { user, panel, graph } = await setup();
    const graphId = graph()?.id ?? '';
    const session = {
      graphId,
      pick: [10, 2.5] as const,
      color: null,
      tolerance: null,
      running: true,
      fraction: 0.4,
      result: null,
      kept: new Set<number>(),
      error: null,
    };
    act(() => {
      useMaskStore.setState({ session });
    });
    expect(panel.getByRole('progressbar')).toBeTruthy();
    await user.click(panel.getByRole('button', { name: 'Cancel' }));
    expect(useMaskStore.getState().session?.running).toBe(false);
    act(() => {
      useMaskStore.setState({
        session: { ...session, running: false, error: 'The picked colour is the paper colour' },
      });
    });
    expect(panel.getByRole('alert').textContent).toBe(
      'The picked colour is the paper colour. Click on a curve.',
    );
    await user.click(panel.getByRole('button', { name: 'Clear' }));
    expect(useMaskStore.getState().session).toBeNull();
  });
});
