import type { Project, Settings } from '../types.ts';
import type { Command } from './command.ts';

export function renameProject(name: string): Command {
  return {
    label: 'Rename project',
    apply: (project) => ({ ...project, name }),
    invert: (before) => renameProject(before.name),
  };
}

/** Edits with the same `coalesceKey` (one field focus) undo as one step. */
export function updateSettings(patch: Partial<Settings>, coalesceKey?: string): Command {
  return {
    label: 'Change settings',
    ...(coalesceKey === undefined ? {} : { coalesceKey }),
    apply: (project) => ({ ...project, settings: { ...project.settings, ...patch } }),
    invert: (before) => setSettings(before.settings),
  };
}

function setSettings(settings: Settings): Command {
  return {
    label: 'Change settings',
    apply: (project: Project) => ({ ...project, settings }),
    invert: (before) => setSettings(before.settings),
  };
}
