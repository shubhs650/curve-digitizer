import { addDataset, type Dataset } from '@cd/core';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { workspaceWithGraph } from '../test/workspace';
import { useUiStore } from '../ui/uiStore';

afterEach(() => {
  cleanup();
  useUiStore.setState({ activeGraphId: null, activeDatasetIds: {}, selection: new Set(), snap: true });
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
  points: ['p1', 'p2'].map((id, i) => ({
    id,
    px: [10 + i, 20.125] as const,
    value: [0, 0] as const,
    sigma: [0, 0] as const,
    excludedFromFit: false,
    outOfRange: false,
    origin: i === 0 ? ('snap' as const) : ('manual' as const),
  })),
};

async function setup() {
  const workspace = await workspaceWithGraph();
  const store = workspace.state.store;
  if (!store) throw new Error('no project');
  store.dispatch(addDataset(store.project.graphs[0]?.id ?? '', DATASET));
  const user = userEvent.setup();
  render(<App workspace={workspace} />);
  const panel = within(screen.getByRole('region', { name: 'Points' }));
  return { store, user, panel };
}

describe('PointsPanel', () => {
  it('describes the selection and deletes it', async () => {
    const { store, user, panel } = await setup();
    expect(panel.getByTestId('point-selection').textContent).toBe('No points selected.');
    act(() => {
      useUiStore.getState().setSelection(new Set(['d1/p1']));
    });
    expect(panel.getByTestId('point-selection').textContent).toBe(
      'Selected: x 10.00 px, y 20.13 px, snapped',
    );
    act(() => {
      useUiStore.getState().setSelection(new Set(['d1/p1', 'd1/p2', 'd1/gone']));
    });
    expect(panel.getByTestId('point-selection').textContent).toBe('2 points selected.');
    await user.click(panel.getByRole('button', { name: 'Delete 2 points' }));
    expect(store.project.graphs[0]?.datasets[0]?.points).toEqual([]);
    expect(useUiStore.getState().selection.size).toBe(0);
  });

  it('turns snap off and sets its radius in the project settings', async () => {
    const { store, user, panel } = await setup();
    await user.click(panel.getByRole('switch', { name: 'Magnetic snap to the curve' }));
    expect(useUiStore.getState().snap).toBe(false);
    const radius = panel.getByRole('textbox', { name: 'Snap radius (px)' });
    await user.clear(radius);
    await user.type(radius, '12');
    expect(store.project.settings.snapRadiusPx).toBe(12);
    await user.type(radius, '0');
    // 120 px is out of range and not applied.
    expect(store.project.settings.snapRadiusPx).toBe(12);
  });
});
