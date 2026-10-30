import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../App';
import { FAKE_PASSWORD, FakePdfBackend, LOCKED_PDF, NO_COPY_PDF, pdfFile, PLAIN_PDF } from '../test/fakePdf';
import { testWorkspace, TINY_PNG } from '../test/workspace';

afterEach(cleanup);

function setup() {
  const pdf = new FakePdfBackend();
  const workspace = testWorkspace(pdf);
  const user = userEvent.setup();
  render(<App workspace={workspace} />);
  const input = () => screen.getByLabelText('PDF or image files');
  const sidebar = () => within(screen.getByRole('complementary', { name: 'Project and pages' }));
  // An open dialog hides the rest of the page from queries by role; Tabster un-hides it a moment after close.
  const dialogClosed = () =>
    waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('complementary', { name: 'Project and pages' })).not.toBeNull();
    });
  return { workspace, pdf, user, input, sidebar, dialogClosed };
}

describe('opening PDFs', () => {
  it('adds a picked PDF to a new project and lists its pages', async () => {
    const { user, input, sidebar } = setup();
    await user.upload(input(), pdfFile(PLAIN_PDF, 'pump.pdf'));
    const pages = within(await sidebar().findByRole('list', { name: 'Pages of pump.pdf' }));
    expect(pages.getAllByRole('img').map((img) => img.getAttribute('aria-label'))).toEqual([
      'Page 1 of pump.pdf',
      'Page 2 of pump.pdf',
    ]);
    expect(sidebar().getByText('2 pages')).toBeTruthy();
    expect(sidebar().getByText('pump', { selector: 'span' })).toBeTruthy();
  });

  it('takes PDFs and images from one pick', async () => {
    const { user, input, sidebar, workspace } = setup();
    await user.upload(input(), [
      pdfFile(PLAIN_PDF),
      new File([TINY_PNG], 'curve.png', { type: 'image/png' }),
    ]);
    await sidebar().findByRole('button', { name: 'curve' });
    expect(workspace.state.store?.project.sources).toHaveLength(1);
  });

  it('asks for the password until it is right (R6)', async () => {
    const { user, input, sidebar, dialogClosed } = setup();
    await user.upload(input(), pdfFile(LOCKED_PDF, 'secret.pdf'));
    let dialog = within(await screen.findByRole('dialog', { name: 'Password for “secret.pdf”' }));
    await user.type(dialog.getByLabelText(/Password/), 'wrong');
    await user.click(dialog.getByRole('button', { name: 'Open' }));
    dialog = within(await screen.findByRole('dialog'));
    expect(await dialog.findByText('The password is not correct.')).toBeTruthy();
    await user.type(dialog.getByLabelText(/Password/), FAKE_PASSWORD);
    await user.click(dialog.getByRole('button', { name: 'Open' }));
    await dialogClosed();
    await sidebar().findByRole('list', { name: 'Pages of secret.pdf' });
  });

  it('cancelling the password adds nothing', async () => {
    const { user, input, workspace, dialogClosed } = setup();
    await user.upload(input(), pdfFile(LOCKED_PDF, 'secret.pdf'));
    const dialog = within(await screen.findByRole('dialog'));
    await user.click(dialog.getByRole('button', { name: 'Cancel' }));
    await dialogClosed();
    expect(workspace.state.store).toBeNull();
  });

  it('says when the author forbids copying (R6)', async () => {
    const { user, input, sidebar } = setup();
    await user.upload(input(), pdfFile(NO_COPY_PDF));
    expect(await sidebar().findByText(/does not allow copying its content/)).toBeTruthy();
    expect(sidebar().getByRole('list', { name: 'Pages of chart.pdf' })).toBeTruthy();
  });

  it('falls back to images when PDF support cannot be loaded (R5)', async () => {
    const { user, input, pdf, sidebar } = setup();
    pdf.unavailable = true;
    await user.upload(input(), pdfFile(PLAIN_PDF));
    expect((await screen.findAllByText('PDF support could not be loaded')).length).toBeGreaterThan(0);
    expect(screen.getByText('No project open.')).toBeTruthy();
    await user.upload(input(), new File([TINY_PNG], 'curve.png', { type: 'image/png' }));
    await sidebar().findByRole('button', { name: 'curve' });
  });

  it('unlocks a protected PDF of a reopened project', async () => {
    const { user, sidebar, workspace, dialogClosed } = setup();
    // jsdom-only: Tabster leaves a second modal aria-hidden after the first one unmounts (the e2e covers both).
    await workspace.importPdf(pdfFile(LOCKED_PDF, 'secret.pdf'), FAKE_PASSWORD);
    await sidebar().findByRole('list', { name: 'Pages of secret.pdf' });

    await user.click(sidebar().getByRole('button', { name: 'All projects' }));
    await user.click(await screen.findByRole('button', { name: 'Open secret' }));
    await user.click(await sidebar().findByRole('button', { name: 'Unlock…' }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByLabelText(/Password/), FAKE_PASSWORD);
    await user.click(dialog.getByRole('button', { name: 'Open' }));
    await dialogClosed();
    await sidebar().findByRole('list', { name: 'Pages of secret.pdf' });
    expect(workspace.state.pdf['id1']).toMatchObject({ status: 'open' });
  });
});
