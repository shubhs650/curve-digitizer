import { describe, expect, it } from 'vitest';
import { fixtureJson, mutableFixture } from './testing.ts';
import { parseProject, ProjectFormatError } from './validate.ts';

function errorPath(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof ProjectFormatError) return error.path;
    throw error;
  }
  return undefined;
}

describe('parseProject', () => {
  it('accepts the schema-v1 fixture unchanged', () => {
    expect(parseProject(fixtureJson)).toEqual(fixtureJson);
  });

  it('keeps filter-step params, including unknown ops', () => {
    const json = mutableFixture();
    const g = json.graphs[0] as { processing: unknown[] };
    g.processing.push({ op: 'fromTheFuture', strength: 3 });
    const project = parseProject(json);
    expect(project.graphs[0]?.processing.at(-1)).toEqual({ op: 'fromTheFuture', strength: 3 });
  });

  it('drops unknown keys outside filter steps', () => {
    const json = { ...mutableFixture(), extra: true };
    expect(parseProject(json)).not.toHaveProperty('extra');
  });

  it.each([
    ['name', (j: Record<string, unknown>) => (j.name = 3)],
    ['schemaVersion', (j: Record<string, unknown>) => (j.schemaVersion = 2)],
    ['app.name', (j: Record<string, unknown>) => (j.app = { name: 'other', version: '1' })],
    [
      'settings.defaultDpi',
      (j: Record<string, unknown>) => (j.settings = { units: 'SI', defaultDpi: 'x', snapRadiusPx: 8 }),
    ],
    ['graphs', (j: Record<string, unknown>) => (j.graphs = {})],
  ])('reports the path of a bad top-level field: %s', (path, mutate) => {
    const json = mutableFixture();
    mutate(json);
    expect(errorPath(() => parseProject(json))).toBe(path);
  });

  it.each([
    [
      'graphs[0].source.rotation',
      (g: Record<string, unknown>) => ((g.source as Record<string, unknown>).rotation = 45),
    ],
    [
      'graphs[0].source.rectPt',
      (g: Record<string, unknown>) => ((g.source as Record<string, unknown>).rectPt = [1, 2, 3]),
    ],
    [
      'graphs[0].calibration.matrix',
      (g: Record<string, unknown>) => ((g.calibration as Record<string, unknown>).matrix = [1]),
    ],
    [
      'graphs[0].calibration.xAxis.type',
      (g: Record<string, unknown>) =>
        ((g.calibration as Record<string, unknown>).xAxis = { type: 'ln', label: '' }),
    ],
    [
      'graphs[0].datasets[0].points[1].origin',
      (g: Record<string, unknown>) => {
        const d = (g.datasets as { points: Record<string, unknown>[] }[])[0];
        if (d?.points[1]) d.points[1].origin = 'ocr';
      },
    ],
    [
      'graphs[0].datasets[0].points[0].px[1]',
      (g: Record<string, unknown>) => {
        const d = (g.datasets as { points: Record<string, unknown>[] }[])[0];
        if (d?.points[0]) d.points[0].px = [1, Number.NaN];
      },
    ],
    [
      'graphs[0].fits[0].params.b',
      (g: Record<string, unknown>) =>
        ((g.fits as Record<string, unknown>[])[0] = {
          ...(g.fits as Record<string, unknown>[])[0],
          params: { a: 1, b: '2' },
        }),
    ],
    ['graphs[0].view', (g: Record<string, unknown>) => (g.view = null)],
  ])('reports the path of a bad nested field: %s', (path, mutate) => {
    const json = mutableFixture();
    const graph = json.graphs[0];
    if (graph) mutate(graph);
    expect(errorPath(() => parseProject(json))).toBe(path);
  });

  it('accepts spline knot vectors in fit params', () => {
    const json = mutableFixture();
    const fits = json.graphs[0]?.fits as Record<string, unknown>[];
    fits[0] = { ...fits[0], model: 'cubicSpline', params: { knotsX: [1, 2, 3], knotsY: [4, 5, 6] } };
    expect(parseProject(json).graphs[0]?.fits[0]?.params).toEqual({ knotsX: [1, 2, 3], knotsY: [4, 5, 6] });
  });

  it('rejects duplicate graph ids', () => {
    const json = mutableFixture();
    json.graphs.push({ ...json.graphs[1], id: 'g1' });
    expect(errorPath(() => parseProject(json))).toBe('graphs[2].id');
  });

  it('rejects a crop pointing at an unknown source', () => {
    const json = mutableFixture();
    json.sources = [];
    expect(errorPath(() => parseProject(json))).toBe('graphs[0].source.sourceId');
  });

  it('rejects a fit pointing at an unknown dataset', () => {
    const json = mutableFixture();
    const fits = json.graphs[0]?.fits as Record<string, unknown>[];
    fits[0] = { ...fits[0], datasetId: 'nope' };
    expect(errorPath(() => parseProject(json))).toBe('graphs[0].fits[0].datasetId');
  });

  it('rejects a negative point line width, which has no uncertainty (task 2.7)', () => {
    const json = mutableFixture();
    const datasets = json.graphs[0]?.datasets as { points: Record<string, unknown>[] }[];
    const points = datasets[0]?.points ?? [];
    points[0] = { ...points[0], lineWidthPx: -1 };
    expect(errorPath(() => parseProject(json))).toBe('graphs[0].datasets[0].points[0].lineWidthPx');
    points[0] = { ...points[0], lineWidthPx: 0 };
    expect(parseProject(json).graphs[0]?.datasets[0]?.points[0]?.lineWidthPx).toBe(0);
  });

  it('rejects non-objects', () => {
    expect(errorPath(() => parseProject(null))).toBe('$');
    expect(errorPath(() => parseProject([]))).toBe('$');
  });
});
