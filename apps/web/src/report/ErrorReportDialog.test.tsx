import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { WorkspaceProvider } from '../session/context';
import { testWorkspace, workspaceWithGraph } from '../test/workspace';
import { Notices, useNotify } from '../ui/notices';
import { useUiStore } from '../ui/uiStore';
import { ErrorBoundary } from './ErrorBoundary';
import { ErrorReportDialog } from './ErrorReportDialog';
import { useReportStore } from './reportStore';

afterEach(() => {
  cleanup();
  useReportStore.setState({ pending: null });
  useUiStore.setState({ activeGraphId: null, activeDatasetIds: {}, selection: new Set(), tool: 'select' });
});

const dialog = () => within(screen.getByRole('dialog', { name: 'Report a problem' }));
const reportBox = () => dialog().getByRole<HTMLTextAreaElement>('textbox', { name: 'Report' });
const issueUrl = () =>
  new URL(dialog().getByRole('link', { name: 'Open GitHub issue' }).getAttribute('href') ?? '');

describe('ErrorReportDialog', () => {
  it('shows the error and environment for review, adds the anonymized project only when ticked', async () => {
    const workspace = await workspaceWithGraph('secret-chart.png');
    const user = userEvent.setup();
    render(<App workspace={workspace} />);
    act(() => {
      useUiStore.getState().setActiveGraph(workspace.state.store?.project.graphs[0]?.id ?? null);
      useUiStore.getState().setTool('point');
      useReportStore.getState().open({ error: new TypeError('x is undefined'), title: 'Trace failed' });
    });

    expect(reportBox().value).toContain('Trace failed: x is undefined');
    expect(reportBox().value).toContain(
      '- Step: graph 1 of 1 · guide step Calibrate · tool point · dock table',
    );
    expect(reportBox().value).toContain('TypeError: x is undefined');
    expect(reportBox().value).not.toContain('Project (anonymized)');
    expect(issueUrl().searchParams.get('body')).toBe(reportBox().value);

    await user.click(dialog().getByRole('checkbox', { name: /Include the project, anonymized/ }));
    expect(reportBox().value).toContain('Project (anonymized)');
    expect(reportBox().value).toContain('"name": "Graph 1"');
    expect(reportBox().value).not.toContain('secret-chart');
    expect(issueUrl().searchParams.get('body')).toContain('"name": "Graph 1"');

    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await user.click(dialog().getByRole('button', { name: 'Copy report' }));
    expect(writeText).toHaveBeenCalledWith(reportBox().value);

    await user.click(dialog().getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(useReportStore.getState().pending).toBeNull();
  });

  it('is offered by every error notice', async () => {
    const user = userEvent.setup();
    function Fails() {
      const notify = useNotify();
      return (
        <button
          onClick={() => {
            notify({
              intent: 'error',
              title: 'Could not export',
              body: 'disk full',
              error: new Error('disk full'),
            });
          }}
        >
          fail
        </button>
      );
    }
    render(
      <FluentProvider theme={webLightTheme}>
        <Fails />
        <Notices />
      </FluentProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'fail' }));
    await user.click(await screen.findByRole('button', { name: 'Report…' }));
    expect(useReportStore.getState().pending).toMatchObject({ title: 'Could not export' });
  });

  it('catches a render crash, offers a reload and opens the report', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Crashes(): never {
      throw new Error('render failed');
    }
    const workspace = await workspaceWithGraph();
    render(
      <FluentProvider theme={webLightTheme}>
        <ErrorBoundary>
          <Crashes />
        </ErrorBoundary>
        <App workspace={workspace} />
      </FluentProvider>,
    );
    expect(screen.getByRole('alert').textContent).toMatch(/Something went wrong/);
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    expect(reportBox().value).toContain('Crash: render failed');
    vi.restoreAllMocks();
  });
});

// The dialog must not need a project: a crash can come before one is open.
describe('ErrorReportDialog without a project', () => {
  it('reports from the home screen with the project option off', () => {
    render(
      <FluentProvider theme={webLightTheme}>
        <WorkspaceProvider workspace={testWorkspace()}>
          <ErrorReportDialog />
        </WorkspaceProvider>
      </FluentProvider>,
    );
    act(() => {
      useReportStore.getState().open({ error: 'worker died' });
    });
    expect(reportBox().value).toContain('worker died');
    expect(dialog().getByRole('checkbox', { name: /Include the project/ })).toHaveProperty('disabled', true);
  });
});
