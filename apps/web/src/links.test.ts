import { describe, expect, it } from 'vitest';
import { DOCS_PATH, OET_HOME_URL, REPO_URL, reportIssueUrl } from './links';

describe('header links', () => {
  it('point at OET home, the in-app docs route and the repository', () => {
    expect(OET_HOME_URL).toBe('https://openengtools.com');
    expect(DOCS_PATH).toBe('/docs');
    expect(REPO_URL).toBe('https://github.com/shubhs650/curve-digitizer');
  });
});

describe('reportIssueUrl', () => {
  const url = new URL(reportIssueUrl({ version: '0.1.0', userAgent: 'Mozilla/5.0 (X11) Chrome/150' }));

  it('opens a new issue on the repository and nothing else', () => {
    expect(`${url.origin}${url.pathname}`).toBe(`${REPO_URL}/issues/new`);
    expect([...url.searchParams.keys()].sort()).toEqual(['body', 'labels']);
    expect(url.searchParams.get('labels')).toBe('bug');
  });

  it('prefills the app version and browser so the reporter does not have to', () => {
    const body = url.searchParams.get('body') ?? '';
    expect(body).toContain('Version: 0.1.0');
    expect(body).toContain('Browser: Mozilla/5.0 (X11) Chrome/150');
  });
});
