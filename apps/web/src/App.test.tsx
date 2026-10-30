import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { DOCS_PATH, OET_HOME_URL, REPO_URL } from './links';

afterEach(cleanup);

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

  it('lays out the empty regions: sidebar, tool rail, canvas, inspector, bottom dock', () => {
    renderApp();
    expect(screen.getByRole('complementary', { name: 'Project and pages' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Tools' })).toBeTruthy();
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

  it('collapses and expands the bottom dock body', async () => {
    const { user } = renderApp();
    const toggle = screen.getByRole('button', { name: 'Data dock' });
    const bodyId = toggle.getAttribute('aria-controls') ?? '';
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById(bodyId)).not.toBeNull();

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(bodyId)).toBeNull();
  });
});
