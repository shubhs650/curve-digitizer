// Test helpers; not exported from the package.
import fixture from '../fixtures/schema-v1/project.json';
import type { Graph, Project } from './types.ts';
import { parseProject } from './validate.ts';

/** Freezes recursively so any mutation in a command or the store throws in strict mode. */
export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const fixtureJson: unknown = fixture;

const cloneJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

/** A fresh, frozen copy of the schema-v1 fixture. */
export function sampleProject(): Project {
  return deepFreeze(parseProject(cloneJson(fixture)));
}

export function sampleGraph(id: string): Graph {
  return deepFreeze({
    id,
    name: `Graph ${id}`,
    source: { kind: 'image' },
    image: { path: `graphs/${id}/original.png`, width: 10, height: 10 },
    processing: [],
    calibration: null,
    datasets: [],
    fits: [],
    view: { zoom: 1, pan: [0, 0] },
  });
}

/** Clone of the fixture as a plain mutable object, for building invalid inputs. */
// structuredClone of JSON yields plain data; the casts only let tests poke at fields.
export function mutableFixture(): Record<string, unknown> & { graphs: Record<string, unknown>[] } {
  return cloneJson(fixture) as Record<string, unknown> & {
    graphs: Record<string, unknown>[];
  };
}
