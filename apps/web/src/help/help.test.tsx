import { addDataset, setCalibration } from '@cd/core';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { EMPTY_DRAFT, evaluateDraft } from '../calibration/draft';
import * as download from '../export/download';
import * as exporting from '../export/runExport';
import { testWorkspace, workspaceWithGraph } from '../test/workspace';
import { useUiStore } from '../ui/uiStore';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  useUiStore.setState({
    activeGraphId: null,
    shortcutsOpen: false,
    exportedProjects: new Set(),
    tool: 'select',
  });
});

const sidebar = () => within(screen.getByRole('complementary', { name: 'Project and pages' }));
const guide = () => within(sidebar().getByRole('region', { name: 'Getting started' }));
const stepStates = () =>
  guide()
    .getAllByRole('listitem')
    .map((li) => li.textContent);

describe('getting-started guide', () => {
  it('shows Crop as the next step in a new, empty project', async () => {
    const workspace = testWorkspace();
    render(<App workspace={workspace} />);
    await workspace.createProject();
    await screen.findByRole('complementary', { name: 'Project and pages' });
    expect(stepStates()[0]).toMatch(/^1\. Crop, next/);
    expect(guide().getByText(/Open a PDF of the graph/)).toBeTruthy();
  });

  it('ticks steps as the graph is calibrated, digitized and exported', async () => {
    vi.spyOn(download, 'downloadFile').mockImplementation(() => undefined);
    // The export itself runs in the compute workers, which jsdom lacks; its own tests live in @cd/export.
    vi.spyOn(exporting, 'runExport').mockResolvedValue({
      bytes: new ArrayBuffer(0),
      fileName: 'chart.csv',
      mimeType: 'text/csv',
    });
    const workspace = await workspaceWithGraph();
    const user = userEvent.setup();
    render(<App workspace={workspace} />);
    await sidebar().findByRole('button', { name: 'chart' });
    expect(stepStates()).toEqual([
      expect.stringMatching(/^1\. Crop, done/),
      expect.stringMatching(/^2\. Calibrate, next/),
      '3. Digitize',
      '4. Export',
    ]);
    await user.click(guide().getByRole('button', { name: 'Calibrate (C)' }));
    expect(useUiStore.getState().tool).toBe('calibrate');

    const store = workspace.state.store;
    const graphId = store?.project.graphs[0]?.id ?? '';
    const draft = {
      ...EMPTY_DRAFT,
      picks: [
        [10, 90],
        [190, 90],
        [10, 90],
        [10, 10],
      ] as const,
      values: { ...EMPTY_DRAFT.values, x1: '0', x2: '10', y1: '0', y2: '5' },
    };
    const evaluated = evaluateDraft(draft);
    if (evaluated.status !== 'ok') throw new Error('bad draft');
    store?.dispatch(setCalibration(graphId, evaluated.calibration));
    expect(await guide().findByText(/^3\. Digitize/)).toBeTruthy();
    expect(stepStates()[2]).toMatch(/next/);

    store?.dispatch(
      addDataset(graphId, {
        id: 'd1',
        name: 'Curve',
        color: '#0072b2',
        mode: 'function',
        xUnit: '',
        yUnit: '',
        sourceRef: '',
        notes: '',
        points: [1, 2].map((i) => ({
          id: `p${String(i)}`,
          px: [i * 20, 50] as const,
          value: [i, i] as const,
          sigma: [0, 0] as const,
          excludedFromFit: false,
          outOfRange: false,
          origin: 'manual' as const,
        })),
      }),
    );
    await vi.waitFor(() => {
      expect(stepStates()[3]).toMatch(/^4\. Export, next/);
    });

    await user.click(sidebar().getByRole('button', { name: 'Export' }));
    await user.click(await screen.findByRole('menuitem', { name: /CSV, long/ }));
    await vi.waitFor(() => {
      expect(stepStates()[3]).toMatch(/^4\. Export, done/);
    });
    expect(guide().getByText(/All done/)).toBeTruthy();
  });

  it('can be hidden and brought back, and stays hidden', async () => {
    const user = userEvent.setup();
    const workspace = testWorkspace();
    render(<App workspace={workspace} />);
    await workspace.createProject();
    await screen.findByRole('complementary', { name: 'Project and pages' });
    await user.click(sidebar().getByRole('button', { name: 'Hide the getting-started guide' }));
    expect(sidebar().queryByRole('region', { name: 'Getting started' })).toBeNull();
    cleanup();
    const again = testWorkspace();
    render(<App workspace={again} />);
    await again.createProject();
    await user.click(
      await within(await screen.findByRole('complementary', { name: 'Project and pages' })).findByRole(
        'button',
        { name: 'Show the getting-started guide' },
      ),
    );
    expect(guide().getByText(/Open a PDF/)).toBeTruthy();
  });
});

describe('shortcut cheat sheet', () => {
  it('opens on ?, listing every group, and closes on Escape', async () => {
    const user = userEvent.setup();
    render(<App workspace={testWorkspace()} />);
    // The shortcut listener is attached once the app has rendered; a key pressed earlier goes nowhere.
    await screen.findByRole('heading', { name: 'Projects' });
    await user.keyboard('?');
    // Generous timeout: the first open renders every group, which takes over a second on a loaded CI runner.
    const dialog = within(
      await screen.findByRole('dialog', { name: 'Keyboard shortcuts' }, { timeout: 5000 }),
    );
    for (const group of ['Anywhere', 'Tools', 'Graph canvas', 'Points', 'Data table']) {
      expect(dialog.getByRole('table', { name: new RegExp(`^${group}`) })).toBeTruthy();
    }
    await user.keyboard('{Escape}');
    await vi.waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  // A separate render: in jsdom, reopening right after Escape can race tabster's deferred aria-hidden pass for
  // the closed dialog and leave the new one aria-hidden (15 quick reopen cycles in Chromium never do).
  it('opens from the header button', async () => {
    const user = userEvent.setup();
    render(<App workspace={testWorkspace()} />);
    await user.click(await screen.findByRole('button', { name: 'Shortcuts' }));
    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' }, { timeout: 5000 })).toBeTruthy();
  });

  it('does not open while typing ? in a field', async () => {
    const workspace = await workspaceWithGraph();
    const user = userEvent.setup();
    render(<App workspace={workspace} />);
    await user.click(await screen.findByRole('textbox', { name: 'X axis label' }));
    await user.keyboard('?');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
