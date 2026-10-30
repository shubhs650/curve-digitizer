import { describe, expect, it } from 'vitest';
import { createProject, serializeProject } from './project.ts';
import { sampleProject } from './testing.ts';
import { parseProject } from './validate.ts';

describe('createProject', () => {
  it('builds a valid, empty current-schema project', () => {
    const project = createProject({
      id: 'p1',
      name: 'Untitled',
      appVersion: '0.0.0',
      now: '2026-12-01T00:00:00Z',
    });
    expect(parseProject(project)).toEqual(project);
    expect(project).toMatchObject({
      created: '2026-12-01T00:00:00Z',
      modified: '2026-12-01T00:00:00Z',
      graphs: [],
    });
  });
});

describe('serializeProject', () => {
  it('writes pretty JSON with a trailing newline that parses back', () => {
    const text = serializeProject(sampleProject());
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "schemaVersion": 1,');
    expect(parseProject(JSON.parse(text))).toEqual(sampleProject());
  });
});
