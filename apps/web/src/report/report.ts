import type { Graph, Project } from '@cd/core';
import { currentStep, guideSteps } from '../help/guide';
import { REPO_URL } from '../links';

// The opt-in error reporter (PRD §4.11, ARCHITECTURE §11): everything here only builds text for the user to read.
// Nothing is sent: the report leaves the app only as a GitHub link the user opens, or text the user copies.

export interface ErrorReport {
  readonly message: string;
  /** Sanitized: see {@link sanitizeStack}. */
  readonly stack: string;
  readonly version: string;
  readonly userAgent: string;
  /** What the user was doing, e.g. "graph · Calibrate · tool select · dock fit". */
  readonly step: string;
  /** Pretty-printed {@link anonymizeProject} JSON, or null when not included. */
  readonly project: string | null;
}

/** Longest stack kept, in lines: the top frames say where; the rest is React and the bundler. */
const STACK_LINES = 20;

/**
 * Removes what a stack could reveal beyond the code: the page origin, blob and file URLs, and query strings,
 * leaving bundle-relative paths such as `assets/index-abc.js:1:2`.
 */
export function sanitizeStack(stack: string, origin: string): string {
  const lines = stack
    .split('\n')
    .map((line) =>
      line
        .split(origin)
        .join('')
        .replace(/blob:[^\s)]+/g, 'blob:…')
        .replace(/file:\/\/[^\s)]+/g, 'file:…')
        .replace(/\?[^\s):]*/g, '')
        .trimEnd(),
    )
    .filter((line) => line.length > 0);
  return lines.length > STACK_LINES
    ? [...lines.slice(0, STACK_LINES), `… ${String(lines.length - STACK_LINES)} more lines`].join('\n')
    : lines.join('\n');
}

/** Message and sanitized stack of anything thrown. */
export function describeError(error: unknown, origin: string): { message: string; stack: string } {
  if (error instanceof Error) {
    const head = `${error.name}: ${error.message}`;
    const stack = error.stack ?? '';
    // V8 starts the stack with the message; Firefox and WebKit do not.
    return {
      message: error.message || error.name,
      stack: sanitizeStack(stack.startsWith(head) ? stack : `${head}\n${stack}`, origin),
    };
  }
  return { message: String(error), stack: '' };
}

const anonymizeGraph = (graph: Graph, g: number): Graph => ({
  ...graph,
  name: `Graph ${String(g + 1)}`,
  source: graph.source.kind === 'image' ? { kind: 'image' } : graph.source,
  calibration: graph.calibration && {
    ...graph.calibration,
    xAxis: { ...graph.calibration.xAxis, label: 'X' },
    yAxis: { ...graph.calibration.yAxis, label: 'Y' },
  },
  datasets: graph.datasets.map((d, i) => ({
    ...d,
    name: `Dataset ${String(i + 1)}`,
    sourceRef: '',
    notes: '',
    ...(d.param && { param: { ...d.param, name: 'Parameter' } }),
  })),
});

/**
 * The project without what could identify the user's work: names, axis labels, notes, references and file
 * names are replaced, PDF hashes dropped. Numbers, units and settings stay, since they are what reproduces a
 * bug. Images are never part of `project.json`.
 */
export function anonymizeProject(project: Project): Project {
  return {
    ...project,
    name: 'Project',
    sources: project.sources.map((s, i) => ({ ...s, fileName: `source-${String(i + 1)}.pdf`, sha256: '' })),
    graphs: project.graphs.map(anonymizeGraph),
  };
}

/** The report as Markdown, as the user reviews it, copies it and as the GitHub issue body. */
export function reportText(report: ErrorReport, { project = true } = {}): string {
  const lines = [
    '**What were you doing?**',
    '',
    '',
    '**Error**',
    '',
    '```',
    report.message,
    '```',
    '',
    `- Version: ${report.version}`,
    `- Browser: ${report.userAgent}`,
    `- Step: ${report.step}`,
  ];
  if (report.stack)
    lines.push('', '<details><summary>Stack</summary>', '', '```', report.stack, '```', '', '</details>');
  if (project && report.project !== null) {
    lines.push(
      '',
      '<details><summary>Project (anonymized)</summary>',
      '',
      '```json',
      report.project,
      '```',
      '',
      '</details>',
    );
  }
  return lines.join('\n');
}

/** GitHub refuses longer new-issue URLs; a long project goes by Copy report instead. */
export const MAX_ISSUE_URL = 8000;

const TITLE_CHARS = 80;

/** A prefilled new-issue URL for the report, which the user reviews and submits on GitHub. */
export function errorIssueUrl(report: ErrorReport): { url: string; projectLeftOut: boolean } {
  const title = `Error: ${report.message}`.replace(/\s+/g, ' ');
  const make = (body: string) =>
    `${REPO_URL}/issues/new?${new URLSearchParams({
      labels: 'bug',
      title: title.length > TITLE_CHARS ? `${title.slice(0, TITLE_CHARS - 1)}…` : title,
      body,
    }).toString()}`;
  const full = make(reportText(report));
  if (report.project === null || full.length <= MAX_ISSUE_URL) return { url: full, projectLeftOut: false };
  const note = '\n\n_The anonymized project was too long for the link: paste it from Copy report._';
  return { url: make(reportText(report, { project: false }) + note), projectLeftOut: true };
}

/** The UI state that says what the user was doing. */
export interface StepContext {
  readonly activeGraphId: string | null;
  readonly cropPage: { readonly pageIndex: number } | null;
  readonly tool: string;
  readonly dockTab: string;
  readonly exported: boolean;
}

/** Where the user was, in words that need no names: screen, guide step, tool and dock tab. */
export function describeStep(project: Project | null, ui: StepContext): string {
  if (project === null) return 'home screen';
  if (ui.cropPage) return `cropping PDF page ${String(ui.cropPage.pageIndex + 1)}`;
  // As the canvas does: the first graph when none was picked.
  const index = Math.max(
    0,
    project.graphs.findIndex((g) => g.id === ui.activeGraphId),
  );
  const graph = project.graphs[index];
  if (!graph) return 'project with no graphs';
  const step = currentStep(guideSteps(project, graph, ui.exported));
  return [
    `graph ${String(index + 1)} of ${String(project.graphs.length)}`,
    `guide step ${step?.title ?? 'all done'}`,
    `tool ${ui.tool}`,
    `dock ${ui.dockTab}`,
  ].join(' · ');
}
