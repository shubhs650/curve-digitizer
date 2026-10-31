import { setProcessing } from '@cd/core';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { workspaceWithGraph } from '../test/workspace';
import { useUiStore } from '../ui/uiStore';

afterEach(() => {
  cleanup();
  useUiStore.setState({
    activeGraphId: null,
    activeDatasetIds: {},
    selection: new Set(),
    showProcessed: false,
  });
});

async function setup() {
  const workspace = await workspaceWithGraph();
  const store = workspace.state.store;
  if (!store) throw new Error('no project');
  const user = userEvent.setup();
  render(<App workspace={workspace} />);
  const panel = within(screen.getByRole('region', { name: 'Pre-processing' }));
  const stack = () => store.project.graphs[0]?.processing ?? [];
  return { store, user, panel, stack };
}

describe('ProcessingPanel', () => {
  it('applies the Enhance for tracing preset as one undo step and turns the preview on', async () => {
    const { store, user, panel, stack } = await setup();
    expect(panel.getByText('No filters: the tracers read the original image.')).toBeTruthy();
    await user.click(panel.getByRole('button', { name: 'Enhance for tracing' }));
    expect(stack().map((s) => s.op)).toEqual(['grayscale', 'despeckle', 'gridSuppress', 'contrast']);
    expect(useUiStore.getState().showProcessed).toBe(true);
    expect(panel.getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual([
      '1. Grayscale',
      '2. Despeckle',
      '3. Suppress grid lines',
      '4. Contrast',
    ]);
    act(() => {
      store.undo();
    });
    expect(stack()).toEqual([]);
  });

  it('adds, reorders, edits and removes filters', async () => {
    const { user, panel, stack } = await setup();
    await user.click(panel.getByRole('button', { name: 'Add filter' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Invert' }));
    await user.click(panel.getByRole('button', { name: 'Add filter' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Despeckle' }));
    expect(stack()).toEqual([{ op: 'invert' }, { op: 'despeckle', radius: 1 }]);
    await user.click(panel.getByRole('button', { name: 'Move Despeckle up' }));
    expect(stack().map((s) => s.op)).toEqual(['despeckle', 'invert']);
    const radius = panel.getByRole('spinbutton', { name: 'Radius (px)' });
    await user.clear(radius);
    await user.type(radius, '3{Enter}');
    expect(stack()[0]).toEqual({ op: 'despeckle', radius: 3 });
    await user.click(panel.getByRole('button', { name: 'Remove Invert' }));
    expect(stack()).toEqual([{ op: 'despeckle', radius: 3 }]);
    await user.click(panel.getByRole('switch', { name: 'Show processed image' }));
    expect(useUiStore.getState().showProcessed).toBe(true);
  });

  it('switches a threshold between automatic and a set level', async () => {
    const { store, user, panel, stack } = await setup();
    act(() => {
      store.dispatch(setProcessing(store.project.graphs[0]?.id ?? '', [{ op: 'threshold', level: null }]));
    });
    expect(panel.queryByRole('slider')).toBeNull();
    await user.click(panel.getByRole('switch', { name: 'Automatic level' }));
    expect(stack()[0]).toEqual({ op: 'threshold', level: 0.5 });
    expect(panel.getByRole('slider', { name: /Darkness level/ })).toBeTruthy();
  });

  it('marks steps that will be skipped', async () => {
    const { store, panel } = await setup();
    act(() => {
      store.dispatch(
        setProcessing(store.project.graphs[0]?.id ?? '', [{ op: 'sharpen' }, { op: 'contrast', value: 50 }]),
      );
    });
    expect(panel.getByText('Skipped: unknown filter "sharpen".')).toBeTruthy();
    expect(panel.getByText('Skipped: value must be between 0 and 10.')).toBeTruthy();
  });
});
