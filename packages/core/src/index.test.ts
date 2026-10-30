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
      'addSource',
      'createAudit',
      'createProject',
      'isObj',
      'migrate',
      'nextDatasetColor',
      'parseProject',
      'pointValuesOf',
      'readCdz',
      'removeDataset',
      'removeGraph',
      'removeSource',
      'renameGraph',
      'renameProject',
      'runMigrations',
      'serializeAudit',
      'serializeProject',
      'setCalibration',
      'setPointFlags',
      'sha256Hex',
      'updateDataset',
      'updateSettings',
      'writeCdz',
    ]);
  });
});
