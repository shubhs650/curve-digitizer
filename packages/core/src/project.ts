import { CURRENT_SCHEMA_VERSION } from './migrations/index.ts';
import type { Project, Settings } from './types.ts';

export const DEFAULT_SETTINGS: Settings = { units: 'SI', defaultDpi: 300, snapRadiusPx: 8 };

export interface NewProject {
  readonly id: string;
  readonly name: string;
  readonly appVersion: string;
  /** ISO 8601; becomes both `created` and `modified`. */
  readonly now: string;
}

export function createProject({ id, name, appVersion, now }: NewProject): Project {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    app: { name: 'curve-digitizer', version: appVersion },
    id,
    name,
    created: now,
    modified: now,
    settings: DEFAULT_SETTINGS,
    sources: [],
    graphs: [],
  };
}

/** The exact text written to `project.json`. */
export function serializeProject(project: Project): string {
  return `${JSON.stringify(project, null, 2)}\n`;
}
