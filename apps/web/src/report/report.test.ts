import type { Project } from '@cd/core';
import { describe, expect, it } from 'vitest';
import { REPO_URL } from '../links';
import {
  anonymizeProject,
  describeError,
  describeStep,
  type ErrorReport,
  errorIssueUrl,
  MAX_ISSUE_URL,
  reportText,
  sanitizeStack,
} from './report';
import fixture from '../../../../packages/core/fixtures/schema-v1/project.json?raw';

const project = JSON.parse(fixture) as Project;

const ORIGIN = 'https://curve.openengtools.com';

const report: ErrorReport = {
  message: 'Cannot read properties of undefined',
  stack: 'TypeError: Cannot read properties of undefined\n    at f (assets/index-abc.js:1:2)',
  version: '0.3.0',
  userAgent: 'Mozilla/5.0 Chrome/150',
  step: 'graph 1 of 2 · guide step Digitize · tool point · dock table',
  project: null,
};

describe('sanitizeStack', () => {
  it('keeps bundle paths and drops the origin, blob and file URLs and query strings', () => {
    const stack = [
      'Error: boom',
      `    at trace (${ORIGIN}/assets/index-abc.js?v=3:10:5)`,
      '    at blob:https://curve.openengtools.com/1234-5678:1:1',
      '    at file:///home/someone/curve/x.js:2:3',
    ].join('\n');
    expect(sanitizeStack(stack, ORIGIN)).toBe(
      ['Error: boom', '    at trace (/assets/index-abc.js:10:5)', '    at blob:…', '    at file:…'].join(
        '\n',
      ),
    );
  });

  it('keeps the top 20 frames', () => {
    const stack = Array.from({ length: 30 }, (_, i) => `    at f${String(i)} (a.js:1:1)`).join('\n');
    const lines = sanitizeStack(stack, ORIGIN).split('\n');
    expect(lines).toHaveLength(21);
    expect(lines[20]).toBe('… 10 more lines');
  });
});

describe('describeError', () => {
  it('gives the message and a stack that starts with it, in every engine', () => {
    const error = new RangeError('too far');
    error.stack = `f@${ORIGIN}/assets/a.js:1:2`; // Firefox and WebKit leave the message out
    expect(describeError(error, ORIGIN)).toEqual({
      message: 'too far',
      stack: 'RangeError: too far\nf@/assets/a.js:1:2',
    });
  });

  it('reports anything else thrown as text', () => {
    expect(describeError('worker died', ORIGIN)).toEqual({ message: 'worker died', stack: '' });
  });
});

describe('anonymizeProject', () => {
  const text = JSON.stringify(anonymizeProject(project));

  it('leaves out names, labels, notes, references, file names and hashes', () => {
    for (const secret of [
      'ASME VIII-2 fatigue curves',
      'ASME_VIII_2.pdf',
      '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      'Fig 3-F.1 Carbon steel',
      'Cycles N',
      'Stress amplitude',
      'T = 300 °C',
      'Temperature',
      'ASME BPVC VIII-2 (2023) Fig 3-F.1',
      'Pump curve screenshot',
      'pump.png',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('keeps the numbers, units and structure that reproduce a bug', () => {
    const anonymous = anonymizeProject(project);
    const [g1] = anonymous.graphs;
    const [original] = project.graphs;
    expect(anonymous.graphs.map((g) => g.name)).toEqual(['Graph 1', 'Graph 2']);
    expect(anonymous.sources[0]?.fileName).toBe('source-1.pdf');
    expect(g1?.calibration?.yAxis.unit).toBe('MPa');
    expect(g1?.calibration?.matrix).toEqual(original?.calibration?.matrix);
    expect(g1?.datasets[0]?.points).toEqual(original?.datasets[0]?.points);
    expect(g1?.datasets[0]?.param).toEqual({ name: 'Parameter', value: 300, unit: '°C' });
  });
});

describe('reportText and errorIssueUrl', () => {
  it('lays out the error, the environment and the stack for review', () => {
    const text = reportText(report);
    expect(text).toContain('```\nCannot read properties of undefined\n```');
    expect(text).toContain('- Version: 0.3.0\n- Browser: Mozilla/5.0 Chrome/150\n- Step: graph 1 of 2');
    expect(text).toContain('<summary>Stack</summary>');
    expect(text).not.toContain('Project (anonymized)');
    expect(reportText({ ...report, project: '{}' })).toContain('```json\n{}\n```');
  });

  it('prefills a new bug issue on the repository', () => {
    const { url, projectLeftOut } = errorIssueUrl(report);
    const parsed = new URL(url);
    expect(`${parsed.origin}${parsed.pathname}`).toBe(`${REPO_URL}/issues/new`);
    expect(parsed.searchParams.get('labels')).toBe('bug');
    expect(parsed.searchParams.get('title')).toBe('Error: Cannot read properties of undefined');
    expect(parsed.searchParams.get('body')).toBe(reportText(report));
    expect(projectLeftOut).toBe(false);
  });

  it('leaves a project too long for a link to Copy report', () => {
    const big = { ...report, project: JSON.stringify(anonymizeProject(project), null, 2).repeat(5) };
    const { url, projectLeftOut } = errorIssueUrl(big);
    expect(projectLeftOut).toBe(true);
    expect(url.length).toBeLessThanOrEqual(MAX_ISSUE_URL);
    expect(new URL(url).searchParams.get('body')).toContain('paste it from Copy report');
  });
});

describe('describeStep', () => {
  const ui = { activeGraphId: null, cropPage: null, tool: 'select', dockTab: 'table', exported: false };

  it('names the screen, guide step, tool and dock tab, never the user’s names', () => {
    expect(describeStep(null, ui)).toBe('home screen');
    expect(describeStep(project, { ...ui, cropPage: { pageIndex: 411 } })).toBe('cropping PDF page 412');
    expect(describeStep({ ...project, graphs: [] }, ui)).toBe('project with no graphs');
    expect(describeStep(project, { ...ui, activeGraphId: 'gone' })).toMatch(/^graph 1 of 2 · /);
    expect(describeStep(project, { ...ui, activeGraphId: 'g1', tool: 'point', dockTab: 'fit' })).toBe(
      'graph 1 of 2 · guide step Export · tool point · dock fit',
    );
  });
});
