import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import * as download from '../export/download';
import { testWorkspace, workspaceWithGraph } from '../test/workspace';
import { useUiStore } from '../ui/uiStore';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useUiStore.setState({ activeGraphId: null });
});

describe('project files', () => {
  it('saves the open project as a .cdz from the sidebar and with Ctrl+S', async () => {
    const saved = vi.spyOn(download, 'downloadFile').mockImplementation(() => undefined);
    const workspace = await workspaceWithGraph('pump curve.png');
    const user = userEvent.setup();
    render(<App workspace={workspace} />);
    await user.click(await screen.findByRole('button', { name: 'Save .cdz' }));
    await vi.waitFor(() => {
      expect(saved).toHaveBeenCalledTimes(1);
    });
    const [bytes, fileName, mime] = saved.mock.calls[0] ?? [];
    expect(fileName).toBe('pump curve.cdz');
    expect(mime).toBe('application/x-curve-digitizer');
    // A zip archive.
    expect([...(bytes as Uint8Array).slice(0, 2)]).toEqual([0x50, 0x4b]);

    await user.keyboard('{Control>}s{/Control}');
    await vi.waitFor(() => {
      expect(saved).toHaveBeenCalledTimes(2);
    });
  });

  it('opens a picked .cdz as a project and shows its first graph', async () => {
    const source = await workspaceWithGraph('pump curve.png');
    const { bytes } = await source.saveCdz({ embedSources: false });

    const workspace = testWorkspace();
    const user = userEvent.setup();
    render(<App workspace={workspace} />);
    await user.upload(
      screen.getByLabelText('PDF or image files'),
      new File([bytes as Uint8Array<ArrayBuffer>], 'pump curve.cdz'),
    );
    const sidebar = within(screen.getByRole('complementary', { name: 'Project and pages' }));
    expect(await sidebar.findByRole('button', { name: 'pump curve' })).toBeTruthy();
    expect(workspace.state.store?.project).toEqual(source.state.store?.project);
  });

  it('reports a file named .cdz that is not one', async () => {
    const user = userEvent.setup();
    render(<App workspace={testWorkspace()} />);
    await user.upload(screen.getByLabelText('PDF or image files'), new File(['nope'], 'broken.cdz'));
    expect((await screen.findAllByText('Could not open broken.cdz')).length).toBeGreaterThan(0);
  });
});
