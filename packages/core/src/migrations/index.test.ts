import { describe, expect, it } from 'vitest';
import { fixtureJson, mutableFixture } from '../testing.ts';
import { ProjectFormatError } from '../validate.ts';
import { CURRENT_SCHEMA_VERSION, migrate, MIGRATIONS, type Migration, runMigrations } from './index.ts';

describe('migrate', () => {
  it('has a migration for every version below the current one', () => {
    for (let v = 1; v < CURRENT_SCHEMA_VERSION; v++) expect(MIGRATIONS[v]).toBeTypeOf('function');
  });

  it('round-trips the schema-v1 fixture', () => {
    const project = migrate(fixtureJson);
    expect(project).toEqual(fixtureJson);
    expect(migrate(JSON.parse(JSON.stringify(project)))).toEqual(project);
  });

  it('refuses a file from a newer app', () => {
    const json = { ...mutableFixture(), schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    expect(() => migrate(json)).toThrow(/update the app/);
  });

  it.each([0, 1.5, '1', undefined])('refuses schemaVersion %j', (schemaVersion) => {
    expect(() => migrate({ ...mutableFixture(), schemaVersion })).toThrow(ProjectFormatError);
  });
});

describe('runMigrations', () => {
  const registry: Record<number, Migration> = {
    1: (json) => ({ ...json, a: 'added in v2' }),
    2: (json) => ({ ...json, b: `${String(json.a)}, then v3` }),
  };

  it('applies each step in order and stamps the version', () => {
    expect(runMigrations({ schemaVersion: 1 }, registry, 3)).toEqual({
      schemaVersion: 3,
      a: 'added in v2',
      b: 'added in v2, then v3',
    });
  });

  it('starts from the file version', () => {
    expect(runMigrations({ schemaVersion: 2, a: 'x' }, registry, 3)).toEqual({
      schemaVersion: 3,
      a: 'x',
      b: 'x, then v3',
    });
  });

  it('does not mutate its input', () => {
    const input = Object.freeze({ schemaVersion: 1 });
    runMigrations(input, registry, 3);
    expect(input).toEqual({ schemaVersion: 1 });
  });

  it('fails on a gap in the chain', () => {
    expect(() => runMigrations({ schemaVersion: 1 }, { 1: registry[1] as Migration }, 3)).toThrow(
      /no migration from v2/,
    );
  });
});
