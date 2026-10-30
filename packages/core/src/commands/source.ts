import type { Project, SourceFile } from '../types.ts';
import { type Command, CommandError } from './command.ts';

/** Records a source PDF the project's graphs can be cropped from. Its bytes are stored outside `project.json`. */
export function addSource(source: SourceFile): Command {
  return {
    label: 'Add PDF',
    apply: (project) => {
      if (project.sources.some((s) => s.id === source.id)) {
        throw new CommandError(`A source with id "${source.id}" already exists`);
      }
      return { ...project, sources: [...project.sources, source] };
    },
    invert: () => removeSource(source.id),
  };
}

/** Forgets a source no graph crops from; graphs keep their provenance, so a referenced source stays. */
export function removeSource(sourceId: string): Command {
  const index = (project: Project) => {
    const i = project.sources.findIndex((s) => s.id === sourceId);
    if (i < 0) throw new CommandError(`No source with id "${sourceId}"`);
    return i;
  };
  return {
    label: 'Remove PDF',
    apply: (project) => {
      const i = index(project);
      if (project.graphs.some((g) => g.source.kind === 'pdfCrop' && g.source.sourceId === sourceId)) {
        throw new CommandError(`Source "${sourceId}" is still cropped from by a graph`);
      }
      return { ...project, sources: project.sources.filter((_, k) => k !== i) };
    },
    invert: (before) => {
      const i = index(before);
      const source = before.sources[i] as SourceFile;
      return {
        label: 'Add PDF',
        apply: (project) => {
          const sources = [...project.sources];
          sources.splice(i, 0, source);
          return { ...project, sources };
        },
        invert: () => removeSource(sourceId),
      };
    },
  };
}
