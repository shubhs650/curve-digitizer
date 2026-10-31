import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import DocsApp from './DocsApp';
import { DOC_PAGES } from './pages';

afterEach(cleanup);

describe('DocsApp', () => {
  it('shows the page with every page in the navigation', () => {
    render(<DocsApp slug="calibration" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Calibration' })).toBeTruthy();
    const nav = within(screen.getByRole('navigation', { name: 'Documentation' }));
    expect(nav.getAllByRole('link')).toHaveLength(DOC_PAGES.length);
    expect(nav.getByRole('link', { name: 'Calibration' }).getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Back to the app' }).getAttribute('href')).toBe('/');
    expect(document.title).toBe('Calibration · Curve Digitizer docs');
  });

  it('says when a page does not exist', () => {
    render(<DocsApp slug="nope" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeTruthy();
  });
});
