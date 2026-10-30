// Header destinations from PRD §4.11. They are navigations, never fetches: the app itself only talks to 'self'.
export const OET_HOME_URL = 'https://openengtools.com';
export const DOCS_PATH = '/docs';
export const REPO_URL = 'https://github.com/shubhs650/curve-digitizer';

export interface IssueContext {
  readonly version: string;
  readonly userAgent: string;
}

/** A prefilled "new issue" URL; the user reviews and submits it on GitHub, nothing is sent from the app. */
export function reportIssueUrl({ version, userAgent }: IssueContext): string {
  const body = [
    '**What happened?**',
    '',
    '**What did you expect?**',
    '',
    '**Steps to reproduce**',
    '1. ',
    '',
    '---',
    `Version: ${version}`,
    `Browser: ${userAgent}`,
  ].join('\n');
  const params = new URLSearchParams({ labels: 'bug', body });
  return `${REPO_URL}/issues/new?${params.toString()}`;
}
