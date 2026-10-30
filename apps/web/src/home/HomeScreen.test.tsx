import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { Workspace } from '../session/workspace';
import { MemoryRepository } from '../storage/memory';

afterEach(cleanup);

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 3, 0, 0, 0, 2,
  8, 2, 0, 0, 0,
]);

function setup() {
  let id = 0;
  const workspace = new Workspace({
    repo: new MemoryRepository(),
    encodePng: () => Promise.reject(new Error('not used')),
    newId: () => `id${String(++id)}`,
    now: () => new Date().toISOString(),
    appVersion: 'test',
  });
  const user = userEvent.setup();
  render(<App workspace={workspace} />);
  return { workspace, user };
}

describe('home screen and image input', () => {
  it('starts on the empty project list', async () => {
    setup();
    expect(await screen.findByText('No saved projects yet.')).toBeTruthy();
    expect(screen.getByText('No project open.')).toBeTruthy();
  });

  it('opens a picked image as a graph of a new project and goes back to the list', async () => {
    const { user } = setup();
    await user.upload(
      screen.getByLabelText('Image files'),
      new File([PNG], 'pump-curve.png', { type: 'image/png' }),
    );
    const sidebar = within(screen.getByRole('complementary', { name: 'Project and pages' }));
    const graphs = within(await sidebar.findByRole('list', { name: 'Graphs' }));
    expect(graphs.getByRole('button', { name: 'pump-curve' }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('application', { name: /Graph image: pump-curve, 3 × 2 px/ })).toBeTruthy();

    await user.click(sidebar.getByRole('button', { name: 'All projects' }));
    const list = within(await screen.findByRole('list', { name: 'Saved projects' }));
    expect(list.getByText('pump-curve')).toBeTruthy();
    expect(list.getByText(/1 graph$/)).toBeTruthy();
  });

  it('creates an empty project, then deletes it after confirmation', async () => {
    const { user, workspace } = setup();
    await user.click(screen.getByRole('button', { name: 'New project' }));
    expect(await screen.findByText('No graphs yet.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'All projects' }));
    await user.click(await screen.findByRole('button', { name: 'Delete Untitled project' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(workspace.state.projects).toEqual([]);
    });
    expect(await screen.findByText('No saved projects yet.')).toBeTruthy();
  });

  it('reports a file that is not an image', async () => {
    const { user } = setup();
    await user.upload(
      screen.getByLabelText('Image files'),
      new File(['hello'], 'notes.png', { type: 'image/png' }),
    );
    expect(await screen.findByText('Could not open notes.png')).toBeTruthy();
    expect(screen.getByText('No project open.')).toBeTruthy();
  });
});
