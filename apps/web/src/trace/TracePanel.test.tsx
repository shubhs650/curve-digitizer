import type { PathNode } from '@cd/trace';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { useReportStore } from '../report/reportStore';
import { workspaceWithGraph } from '../test/workspace';
import { useUiStore } from '../ui/uiStore';
import { DEFAULT_SPACING_PX, type TraceSession, useTraceStore } from './traceStore';

afterEach(() => {
  cleanup();
  useTraceStore.setState({ session: null, spacingPx: DEFAULT_SPACING_PX });
  useUiStore.setState({ activeGraphId: null, activeDatasetIds: {}, selection: new Set(), tool: 'select' });
});

/** A straight trace 40 px long along y = 3.5. */
const nodes: PathNode[] = Array.from({ length: 41 }, (_, i) => ({ px: [i + 0.5, 3.5], width: 2.5 }));

async function setup() {
  const workspace = await workspaceWithGraph();
  const store = workspace.state.store;
  if (!store) throw new Error('no project');
  const user = userEvent.setup();
  render(<App workspace={workspace} />);
  const panel = within(screen.getByRole('region', { name: 'Guided trace' }));
  const graph = () => store.project.graphs[0];
  const session = (patch: Partial<TraceSession>) => {
    act(() => {
      useTraceStore.setState({
        session: {
          graphId: graph()?.id ?? '',
          start: [0.5, 3.5],
          end: null,
          phase: 'done',
          fraction: 1,
          color: [31, 119, 180],
          nodes,
          at: null,
          branches: [],
          reachedEnd: true,
          error: null,
          ...patch,
        },
      });
    });
  };
  return { store, user, panel, graph, session };
}

describe('TracePanel', () => {
  it('offers the tool, then asks for the end pick after the start', async () => {
    const { user, panel, session } = await setup();
    await user.click(panel.getByRole('button', { name: 'Guided trace (T)' }));
    expect(useUiStore.getState().tool).toBe('trace');
    expect(panel.getByText('Click the curve where the trace should start.')).toBeTruthy();
    session({ phase: 'end', nodes: [], color: null });
    expect(panel.getByRole('button', { name: 'Trace to the curve ends' })).toBeTruthy();
    expect(panel.getByRole('button', { name: 'Add 0 points to a new dataset' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('re-samples at the density setting and adds the points as one undo step in a dataset of the curve colour', async () => {
    const { store, user, panel, graph, session } = await setup();
    session({});
    // Spacing 5 over 40 px: the two ends plus every 5 px.
    expect(panel.getByRole('button', { name: 'Add 9 points to a new dataset' })).toBeTruthy();
    const spacing = panel.getByRole('spinbutton', { name: 'Point spacing (px)' });
    await user.clear(spacing);
    await user.type(spacing, '10{Enter}');
    expect(useTraceStore.getState().spacingPx).toBe(10);
    await user.click(panel.getByRole('button', { name: 'Add 5 points to a new dataset' }));
    const dataset = graph()?.datasets[0];
    expect(dataset?.color).toBe('#1f77b4');
    expect(dataset?.points.map((p) => p.px[0])).toEqual([0.5, 10.5, 20.5, 30.5, 40.5]);
    expect(dataset?.points.every((p) => p.origin === 'trace' && p.lineWidthPx === 2.5)).toBe(true);
    expect(useTraceStore.getState().session).toBeNull();
    act(() => {
      store.undo();
    });
    expect(graph()?.datasets[0]?.points).toEqual([]);
  });

  it('sets the active dataset colour from the eyedropper', async () => {
    const { user, panel, graph, session } = await setup();
    session({});
    await user.click(panel.getByRole('button', { name: 'Add 9 points to a new dataset' }));
    session({ color: [255, 127, 14] });
    await user.click(panel.getByRole('button', { name: /^Use for / }));
    expect(graph()?.datasets[0]?.color).toBe('#ff7f0e');
    expect(panel.queryByRole('button', { name: /^Use for / })).toBeNull();
  });

  it('asks which branch to follow, and can stop there', async () => {
    const { user, panel, session } = await setup();
    session({
      phase: 'branch',
      at: [40.5, 3.5],
      branches: [
        {
          direction: [1, -1],
          preview: [
            [40.5, 3.5],
            [47.5, -3.5],
          ],
        },
        {
          direction: [1, 1],
          preview: [
            [40.5, 3.5],
            [47.5, 10.5],
          ],
        },
      ],
    });
    expect(panel.getByRole('status').textContent).toContain('The curve splits here');
    expect(panel.getByRole('button', { name: 'Follow branch 1' })).toBeTruthy();
    expect(panel.getByRole('button', { name: 'Follow branch 2' })).toBeTruthy();
    await user.click(panel.getByRole('button', { name: 'Stop here' }));
    expect(useTraceStore.getState().session?.phase).toBe('done');
    expect(panel.getByRole('button', { name: 'Add 9 points to a new dataset' })).toBeTruthy();
  });

  it('shows errors, offers to report them, and clears', async () => {
    const { user, panel, session } = await setup();
    const cause = new Error('No curve near the start point');
    session({ phase: 'error', nodes: [], error: cause.message, cause });
    expect(panel.getByRole('alert').textContent).toBe(
      'No curve near the start point. Click on a curve to start again. Report this error…',
    );
    await user.click(panel.getByRole('button', { name: 'Report this error…' }));
    expect(useReportStore.getState().pending).toMatchObject({ error: cause, title: 'Trace failed' });
    act(() => {
      useReportStore.getState().close();
    });
    await user.click(panel.getByRole('button', { name: 'Clear' }));
    expect(useTraceStore.getState().session).toBeNull();
  });
});
