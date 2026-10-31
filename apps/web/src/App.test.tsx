import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { DOCS_PATH, OET_HOME_URL, REPO_URL } from './links';
import { workspaceWithGraph } from './test/workspace';
import { useUiStore } from './ui/uiStore';

afterEach(() => {
  cleanup();
  localStorage.clear();
  useUiStore.setState({ activeGraphId: null, cropPage: null });
});

function renderApp() {
  const user = userEvent.setup();
  const view = render(<App />);
  return { user, view };
}

describe('App shell', () => {
  it('shows the product name in the header banner', () => {
    renderApp();
    expect(within(screen.getByRole('banner')).getByText('Curve Digitizer')).toBeTruthy();
  });

  it('has the four header links from PRD §4.11', () => {
    renderApp();
    const header = within(screen.getByRole('banner'));
    expect(header.getByRole('link', { name: 'Open Engineering Tools home' }).getAttribute('href')).toBe(
      OET_HOME_URL,
    );
    expect(header.getByRole('link', { name: 'Docs' }).getAttribute('href')).toBe(DOCS_PATH);
    expect(header.getByRole('link', { name: 'Report issue' }).getAttribute('href')).toMatch(
      new RegExp(`^${REPO_URL}/issues/new\\?`),
    );
    expect(header.getByRole('link', { name: 'GitHub repository' }).getAttribute('href')).toBe(REPO_URL);
  });

  it('opens off-site links in a new tab without leaking the opener', () => {
    renderApp();
    for (const name of ['Open Engineering Tools home', 'Report issue', 'GitHub repository']) {
      const link = screen.getByRole('link', { name });
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });

  it('gives the home screen the whole width: no tool rail, inspector or dock without a graph', () => {
    renderApp();
    expect(screen.getByRole('main', { name: 'Canvas' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Tools' })).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Data dock' })).toBeNull();
  });

  it('lays out a graph: sidebar, tool rail, canvas, inspector, bottom dock', async () => {
    render(<App workspace={await workspaceWithGraph()} />);
    expect(await screen.findByRole('region', { name: 'Tools' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Project and pages' })).toBeTruthy();
    expect(screen.getByRole('main', { name: 'Canvas' })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Data dock' })).toBeTruthy();
  });

  it('starts in the light theme and switches to dark and back', async () => {
    const { user, view } = renderApp();
    const shell = view.container.querySelector('[data-theme]');
    const toggle = screen.getByRole('button', { name: 'Dark theme' });
    expect(shell?.getAttribute('data-theme')).toBe('light');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    await user.click(toggle);
    expect(shell?.getAttribute('data-theme')).toBe('dark');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');

    await user.click(toggle);
    expect(shell?.getAttribute('data-theme')).toBe('light');
  });

  it('collapses and expands the project sidebar', async () => {
    const { user } = renderApp();
    const toggle = screen.getByRole('button', { name: 'Project sidebar' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('complementary', { name: 'Project and pages' })).toBeNull();

    await user.click(toggle);
    expect(screen.getByRole('complementary', { name: 'Project and pages' })).toBeTruthy();
  });

  it('collapses and expands the bottom dock body, and remembers it', async () => {
    const user = userEvent.setup();
    const workspace = await workspaceWithGraph();
    const first = render(<App workspace={workspace} />);
    const toggle = await screen.findByRole('button', { name: 'Data dock' });
    const bodyId = toggle.getAttribute('aria-controls') ?? '';
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(bodyId)).not.toBeNull();

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(bodyId)).toBeNull();

    first.unmount();
    render(<App workspace={workspace} />);
    expect((await screen.findByRole('button', { name: 'Data dock' })).getAttribute('aria-expanded')).toBe(
      'false',
    );
  });

  it('resizes the dock from the keyboard on its splitter', async () => {
    const user = userEvent.setup();
    render(<App workspace={await workspaceWithGraph()} />);
    const splitter = await screen.findByRole('separator', { name: 'Resize the data dock' });
    // jsdom has no layout, so the column height falls back to the window's (900 px).
    const before = Number(splitter.getAttribute('aria-valuenow'));
    splitter.focus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(Number(splitter.getAttribute('aria-valuenow'))).toBe(before + 32);
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Data dock' }).getAttribute('aria-expanded')).toBe('false');
  });
});
