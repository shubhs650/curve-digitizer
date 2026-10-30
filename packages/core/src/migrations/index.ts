import type { Project } from '../types.ts';
import { isObj, parseProject, ProjectFormatError } from '../validate.ts';

export const CURRENT_SCHEMA_VERSION = 1;

/** Upgrades a `project.json` object by exactly one schema version. Input is untrusted JSON. */
export type Migration = (json: Readonly<Record<string, unknown>>) => Record<string, unknown>;

/**
 * `MIGRATIONS[n]` upgrades schema vn to v(n+1). Each entry needs a fixture under
 * `packages/core/fixtures/schema-vN/` and a round-trip test.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

/**
 * Applies `registry[from]`, `registry[from + 1]`, … until the object reaches `target`.
 * Throws on a file newer than `target` or a gap in the chain.
 */
export function runMigrations(
  json: unknown,
  registry: Readonly<Record<number, Migration>>,
  target: number,
): Record<string, unknown> {
  if (!isObj(json)) throw new ProjectFormatError('$', 'expected an object');
  const version = json.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new ProjectFormatError('schemaVersion', 'expected a positive integer');
  }
  if (version > target) {
    throw new ProjectFormatError(
      'schemaVersion',
      `file uses schema v${String(version)}, this app reads up to v${String(target)}; update the app`,
    );
  }
  let current: Record<string, unknown> = { ...json };
  for (let v = version; v < target; v++) {
    const step = registry[v];
    if (step === undefined) {
      throw new ProjectFormatError('schemaVersion', `no migration from v${String(v)} to v${String(v + 1)}`);
    }
    current = { ...step(current), schemaVersion: v + 1 };
  }
  return current;
}

/** Brings any supported `project.json` value up to the current schema and validates it. */
export function migrate(json: unknown): Project {
  return parseProject(runMigrations(json, MIGRATIONS, CURRENT_SCHEMA_VERSION));
}
