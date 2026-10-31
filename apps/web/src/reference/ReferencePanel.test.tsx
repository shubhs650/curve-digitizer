import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { TINY_PNG } from '../test/png';
import { workspaceWithGraph } from '../test/workspace';
import { useUiStore } from '../ui/uiStore';
import { useReferenceStore } from './referenceStore';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useReferenceStore.setState({ references: {} });
  useUiStore.setState({ activeGraphId: null, activeDatasetIds: {}, selection: new Set() });
});

async function setup() {
  const close = vi.fn();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(() => Promise.resolve({ width: 320, height: 240, close })),
  );
  const workspace = await workspaceWithGraph();
  const graphId = workspace.state.store?.project.graphs[0]?.id ?? '';
  const user = userEvent.setup();
  render(<App workspace={workspace} />);
  const panel = () => within(screen.getByRole('region', { name: 'Reference overlay' }));
  const pick = async (bytes: Uint8Array, name: string) => {
    await act(async () => {
      fireEvent.change(screen.getByTestId('reference-file-input'), {
        target: { files: [new File([bytes as Uint8Array<ArrayBuffer>], name)] },
      });
      await Promise.resolve();
    });
  };
  return { user, panel, pick, graphId, close };
}

describe('ReferencePanel', () => {
  it('loads an image over the graph, fades, moves, hides and removes it', async () => {
    const { user, panel, pick, graphId, close } = await setup();
    expect(panel().getByText(/not saved with the project/)).toBeTruthy();
    await pick(TINY_PNG, 'second-edition.png');
    expect(await panel().findByText('second-edition.png, 320 × 240 px')).toBeTruthy();
    const reference = () => useReferenceStore.getState().references[graphId];
    expect(reference()).toMatchObject({ opacity: 0.5, offsetPx: [0, 0], visible: true });

    fireEvent.change(panel().getByRole('slider'), { target: { value: '80' } });
    expect(reference()?.opacity).toBeCloseTo(0.8);
    expect(panel().getByText('Opacity 80 %')).toBeTruthy();

    const offsetX = panel().getByRole('spinbutton', { name: 'Offset X (px)' });
    await user.clear(offsetX);
    await user.type(offsetX, '-25{Enter}');
    expect(reference()?.offsetPx).toEqual([-25, 0]);

    await user.click(panel().getByRole('switch', { name: 'Show reference' }));
    expect(reference()?.visible).toBe(false);

    await user.click(panel().getByRole('button', { name: 'Remove reference' }));
    expect(reference()).toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
  });

  it('says when a file is not an image it can show', async () => {
    const { panel, pick, graphId } = await setup();
    await pick(new TextEncoder().encode('%PDF-1.7'), 'notes.pdf');
    expect(await screen.findByText('Could not use notes.pdf as a reference')).toBeTruthy();
    expect(useReferenceStore.getState().references[graphId]).toBeUndefined();
    expect(panel().getByRole('button', { name: 'Load reference image…' })).toBeTruthy();
  });
});
