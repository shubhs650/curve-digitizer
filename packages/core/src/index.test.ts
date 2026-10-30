import { describe, expect, it } from 'vitest';
import * as core from './index.ts';

describe('@cd/core public API', () => {
  it('exports the store, commands, serialization and migrations', () => {
    expect(Object.keys(core).sort()).toEqual([
      'CURRENT_SCHEMA_VERSION',
      'CdzFormatError',
      'CommandError',
      'DATASET_PALETTE',
      'DEFAULT_SETTINGS',
      'MIGRATIONS',
      'ProjectFormatError',
      'ProjectStore',
      'UNDO_LIMIT',
      'addDataset',
      'addGraph',
      'createAudit',
      'createProject',
      'isObj',
      'migrate',
      'nextDatasetColor',
      'parseProject',
      'readCdz',
      'removeDataset',
      'removeGraph',
      'renameGraph',
      'renameProject',
      'runMigrations',
      'serializeAudit',
      'serializeProject',
      'setPointFlags',
      'sha256Hex',
      'updateDataset',
      'updateSettings',
      'writeCdz',
    ]);
  });
});
