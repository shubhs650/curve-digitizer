import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { A1_PDF, FakePdfBackend, NO_COPY_PDF, pdfFile, PLAIN_PDF } from '../test/fakePdf';
import { testWorkspace } from '../test/workspace';
import { useUiStore } from '../ui/uiStore';
import { useCropDraft } from './cropDraft';

afterEach(() => {
  cleanup();
  useUiStore.setState({ activeGraphId: null, cropPage: null });
  useCropDraft.getState().reset();
});

async function openPage(bytes: Uint8Array, fileName: string, pageIndex: number) {
  const pdf = new FakePdfBackend();
  const workspace = testWorkspace(pdf);
  const user = userEvent.setup();
  render(<App workspace={workspace} />);
  await user.upload(screen.getByLabelText('PDF or image files'), pdfFile(bytes, fileName));
  const sidebar = within(screen.getByRole('complementary', { name: 'Project and pages' }));
  const pages = within(await sidebar.findByRole('list', { name: `Pages of ${fileName}` }));
  await user.click(pages.getByRole('button', { name: `Page ${String(pageIndex + 1)} of ${fileName}` }));
  const panel = within(await screen.findByRole('region', { name: 'Crop' }));
  return { pdf, workspace, user, sidebar, panel };
}

describe('cropping a PDF page', () => {
  it('crops the whole page, turned and at the chosen DPI, into a new graph', async () => {
    const { pdf, workspace, user, sidebar, panel } = await openPage(PLAIN_PDF, 'pump.pdf', 1);
    expect(panel.getByText('Page 2 of pump.pdf')).toBeTruthy();
    expect(screen.getByRole('application', { name: /^Page 2 of pump\.pdf: drag a rectangle/ })).toBeTruthy();
    const crop = panel.getByRole('button', { name: 'Crop to new graph' });
    expect(crop.hasAttribute('disabled')).toBe(true);

    await user.click(panel.getByRole('button', { name: 'Whole page' }));
    expect(panel.getByTestId('crop-size').textContent).toBe('2479 × 3508 px at 300 DPI');
    await user.click(panel.getByRole('button', { name: 'Rotate right' }));
    await user.selectOptions(panel.getByLabelText('Resolution'), '600');
    expect(panel.getByTestId('crop-size').textContent).toBe('7017 × 4958 px at 600 DPI');
    expect(panel.getByTestId('crop-turn').textContent).toBe('Turned 90°');

    await user.click(crop);
    await sidebar.findByRole('button', { name: 'pump p2' });
    expect(pdf.crops).toEqual([
      { key: 'id1', pageIndex: 1, rectPt: [0, 0, 595, 842], dpi: 600, rotation: 90 },
    ]);
    expect(screen.queryByRole('region', { name: 'Crop' })).toBeNull();
    expect(useUiStore.getState().activeGraphId).toBe(workspace.state.store?.project.graphs[0]?.id);
  });

  it('says when the pixel budget caps the DPI (R7)', async () => {
    const { user, panel } = await openPage(A1_PDF, 'sheet.pdf', 0);
    await user.click(panel.getByRole('button', { name: 'Whole page' }));
    await user.selectOptions(panel.getByLabelText('Resolution'), '600');
    expect(
      panel.getByText(
        /600 DPI would exceed the 50-megapixel limit, so this crop will be rendered at 254 DPI/,
      ),
    ).toBeTruthy();
    expect(panel.getByTestId('crop-size').textContent).toBe('8410 × 5941 px at 254 DPI');
  });

  it('shows a no-copy page but does not crop it (R6)', async () => {
    const { user, panel } = await openPage(NO_COPY_PDF, 'locked.pdf', 0);
    expect(panel.getByText(/does not allow copying/)).toBeTruthy();
    await user.click(panel.getByRole('button', { name: 'Whole page' }));
    expect(panel.getByRole('button', { name: 'Crop to new graph' }).hasAttribute('disabled')).toBe(true);
  });

  it('leaves the crop view on Cancel', async () => {
    const { user, panel } = await openPage(PLAIN_PDF, 'pump.pdf', 0);
    await user.click(panel.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('region', { name: 'Crop' })).toBeNull();
  });
});

describe('re-rendering a crop', () => {
  it('re-renders at a higher DPI from the inspector, and undo goes back', async () => {
    const { workspace, user, panel } = await openPage(PLAIN_PDF, 'pump.pdf', 0);
    await user.click(panel.getByRole('button', { name: 'Whole page' }));
    await user.selectOptions(panel.getByLabelText('Resolution'), '150');
    await user.click(panel.getByRole('button', { name: 'Crop to new graph' }));

    const source = within(await screen.findByRole('region', { name: 'Source' }));
    expect(source.getByTestId('graph-source').textContent).toBe(
      'Page 1 of pump.pdf, 150 DPI, 1240 × 1754 px',
    );
    const select = source.getByLabelText<HTMLSelectElement>('Re-render at');
    expect([...select.options].map((o) => o.value)).toEqual(['200', '300', '400', '600']);
    expect(select.value).toBe('600');
    await user.selectOptions(select, '300');
    await user.click(source.getByRole('button', { name: 'Re-render at higher DPI' }));
    await waitFor(() => {
      expect(source.getByTestId('graph-source').textContent).toBe(
        'Page 1 of pump.pdf, 300 DPI, 2479 × 3508 px',
      );
    });

    workspace.state.store?.undo();
    await waitFor(() => {
      expect(source.getByTestId('graph-source').textContent).toContain('150 DPI');
    });
  });
});
