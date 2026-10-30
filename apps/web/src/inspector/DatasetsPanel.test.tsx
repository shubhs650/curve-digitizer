import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { workspaceWithGraph } from '../test/workspace';
import { useUiStore } from '../ui/uiStore';
import { nextDatasetName } from './DatasetsPanel';

afterEach(() => {
  cleanup();
  useUiStore.setState({ activeGraphId: null, activeDatasetIds: {} });
});

async function setup() {
  const workspace = await workspaceWithGraph();
  const user = userEvent.setup();
  render(<App workspace={workspace} />);
  const inspector = within(screen.getByRole('complementary', { name: 'Inspector' }));
  const project = () => workspace.state.store?.project.graphs[0];
  return { workspace, user, inspector, project };
}

describe('nextDatasetName', () => {
  it('numbers after the existing datasets and skips names in use', () => {
    expect(nextDatasetName([])).toBe('Dataset 1');
    const ds = (name: string) => ({ name }) as Parameters<typeof nextDatasetName>[0][number];
    expect(nextDatasetName([ds('A'), ds('Dataset 3')])).toBe('Dataset 4');
  });
});

describe('DatasetsPanel', () => {
  it('adds datasets with palette colours and makes the new one active', async () => {
    const { user, inspector, project } = await setup();
    expect(inspector.getByText(/No datasets yet/)).toBeTruthy();
    await user.click(inspector.getByRole('button', { name: 'Add dataset' }));
    await user.click(inspector.getByRole('button', { name: 'Add dataset' }));
    expect(project()?.datasets.map((d) => [d.name, d.color])).toEqual([
      ['Dataset 1', '#0072b2'],
      ['Dataset 2', '#d55e00'],
    ]);
    const list = within(inspector.getByRole('list', { name: 'Datasets' }));
    expect(list.getByRole('button', { name: /Dataset 2/ }).getAttribute('aria-current')).toBe('true');
    await user.click(list.getByRole('button', { name: /Dataset 1/ }));
    expect(inspector.getByRole('group', { name: 'Dataset Dataset 1' })).toBeTruthy();
  });

  it('edits every field, one undo step per field visit', async () => {
    const { user, inspector, project, workspace } = await setup();
    await user.click(inspector.getByRole('button', { name: 'Add dataset' }));
    const name = inspector.getByRole('textbox', { name: 'Name' });
    await user.clear(name);
    await user.type(name, 'T = 300 °C');
    await user.click(inspector.getByRole('radio', { name: /Path/ }));
    await user.type(inspector.getByRole('textbox', { name: 'X unit' }), 'cycles');
    await user.type(inspector.getByRole('textbox', { name: 'Y unit' }), 'MPa');
    await user.click(inspector.getByRole('switch', { name: 'Family parameter' }));
    await user.type(inspector.getByRole('textbox', { name: 'Parameter name' }), 'Temperature');
    const value = inspector.getByRole('textbox', { name: 'Parameter value' });
    await user.clear(value);
    await user.type(value, '3e2');
    await user.type(inspector.getByRole('textbox', { name: 'Parameter unit' }), '°C');
    await user.type(inspector.getByRole('textbox', { name: 'Source reference' }), 'Fig 3-F.1');
    await user.type(inspector.getByRole('textbox', { name: 'Notes' }), 'From the 2023 edition');

    expect(project()?.datasets[0]).toMatchObject({
      name: 'T = 300 °C',
      mode: 'path',
      xUnit: 'cycles',
      yUnit: 'MPa',
      param: { name: 'Temperature', value: 300, unit: '°C' },
      sourceRef: 'Fig 3-F.1',
      notes: 'From the 2023 edition',
    });

    const store = workspace.state.store;
    store?.undo();
    expect(project()?.datasets[0]?.notes).toBe('');
    store?.undo();
    expect(project()?.datasets[0]?.sourceRef).toBe('');
    await waitFor(() => {
      expect(inspector.getByRole('textbox', { name: 'Source reference' })).toHaveProperty('value', '');
    });
  });

  it('shows a validation message for a value that is not a number and keeps the last good one', async () => {
    const { user, inspector, project } = await setup();
    await user.click(inspector.getByRole('button', { name: 'Add dataset' }));
    await user.click(inspector.getByRole('switch', { name: 'Family parameter' }));
    const value = inspector.getByRole('textbox', { name: 'Parameter value' });
    await user.clear(value);
    await user.type(value, '12x');
    expect(inspector.getByText('Enter a number')).toBeTruthy();
    expect(project()?.datasets[0]?.param?.value).toBe(12);
  });

  it('deletes a dataset, undoable with Ctrl+Z', async () => {
    const { user, inspector, project } = await setup();
    await user.click(inspector.getByRole('button', { name: 'Add dataset' }));
    await user.click(inspector.getByRole('button', { name: 'Delete dataset' }));
    expect(project()?.datasets).toEqual([]);
    await user.click(document.body);
    await user.keyboard('{Control>}z{/Control}');
    expect(project()?.datasets.map((d) => d.name)).toEqual(['Dataset 1']);
    await user.keyboard('{Control>}y{/Control}');
    expect(project()?.datasets).toEqual([]);
  });
});
