import { describe, expect, it } from 'vitest';
import * as core from './index.ts';

describe('@cd/core public API', () => {
  it('exports the store, commands, serialization and migrations', () => {
    expect(Object.keys(core).sort()).toEqual([
      'CURRENT_SCHEMA_VERSION',
      'CdzFormatError',
      'CommandError',
      'DEFAULT_SETTINGS',
      'MIGRATIONS',
      'ProjectFormatError',
      'ProjectStore',
      'UNDO_LIMIT',
      'addGraph',
      'createAudit',
      'createProject',
      'isObj',
      'migrate',
      'parseProject',
      'readCdz',
      'removeGraph',
      'renameGraph',
      'renameProject',
      'runMigrations',
      'serializeAudit',
      'serializeProject',
      'sha256Hex',
      'updateSettings',
      'writeCdz',
    ]);
  });
});
