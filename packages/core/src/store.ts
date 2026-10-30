import type { Command } from './commands/command.ts';
import type { Project } from './types.ts';

/** docs/ARCHITECTURE.md §6. */
export const UNDO_LIMIT = 200;

export type ChangeCause = 'dispatch' | 'undo' | 'redo' | 'load';

export interface ProjectChange {
  readonly project: Project;
  readonly cause: ChangeCause;
  /** Label of the command dispatched, undone or redone; absent for `load`. */
  readonly label?: string;
}

export type ChangeListener = (change: ProjectChange) => void;

export interface ProjectStoreOptions {
  /** Clock for `project.modified`; injectable so tests are deterministic. */
  readonly now?: () => string;
  readonly undoLimit?: number;
}

/**
 * One undo step. `forward` replays in order for redo; `inverse` replays in order for undo.
 * A coalesced step holds every merged command so redo and undo stay exact.
 */
interface Step {
  readonly label: string;
  readonly coalesceKey: string | undefined;
  readonly forward: readonly Command[];
  readonly inverse: readonly Command[];
}

const replay = (project: Project, commands: readonly Command[]): Project =>
  commands.reduce((p, c) => c.apply(p), project);

/**
 * Holds the current project and the undo/redo stacks. The only way to change the project is
 * `dispatch`, `undo`, `redo` or `load`; each emits one change event (autosave listens to these).
 */
export class ProjectStore {
  #project: Project;
  #undo: Step[] = [];
  #redo: Step[] = [];
  /** Coalescing only joins dispatches that follow each other directly. */
  #canCoalesce = false;
  readonly #listeners = new Set<ChangeListener>();
  readonly #now: () => string;
  readonly #undoLimit: number;

  constructor(project: Project, options: ProjectStoreOptions = {}) {
    this.#project = project;
    this.#now = options.now ?? (() => new Date().toISOString());
    this.#undoLimit = options.undoLimit ?? UNDO_LIMIT;
  }

  get project(): Project {
    return this.#project;
  }

  get canUndo(): boolean {
    return this.#undo.length > 0;
  }

  get canRedo(): boolean {
    return this.#redo.length > 0;
  }

  get undoLabel(): string | undefined {
    return this.#undo.at(-1)?.label;
  }

  get redoLabel(): string | undefined {
    return this.#redo.at(-1)?.label;
  }

  /** Applies `command`. If it throws, the project and history are left untouched. */
  dispatch(command: Command): void {
    const before = this.#project;
    const inverse = command.invert(before);
    const after = command.apply(before);

    const top = this.#undo.at(-1);
    if (
      this.#canCoalesce &&
      top &&
      command.coalesceKey !== undefined &&
      top.coalesceKey === command.coalesceKey
    ) {
      this.#undo[this.#undo.length - 1] = {
        label: command.label,
        coalesceKey: command.coalesceKey,
        forward: [...top.forward, command],
        inverse: [inverse, ...top.inverse],
      };
    } else {
      this.#undo.push({
        label: command.label,
        coalesceKey: command.coalesceKey,
        forward: [command],
        inverse: [inverse],
      });
      if (this.#undo.length > this.#undoLimit) this.#undo.shift();
    }
    this.#redo = [];
    this.#canCoalesce = true;
    this.#commit(after, 'dispatch', command.label);
  }

  undo(): boolean {
    const step = this.#undo.pop();
    if (!step) return false;
    this.#redo.push(step);
    this.#canCoalesce = false;
    this.#commit(replay(this.#project, step.inverse), 'undo', step.label);
    return true;
  }

  redo(): boolean {
    const step = this.#redo.pop();
    if (!step) return false;
    this.#undo.push(step);
    this.#canCoalesce = false;
    this.#commit(replay(this.#project, step.forward), 'redo', step.label);
    return true;
  }

  /** Replaces the project (open, recover) and clears history. Does not touch `modified`. */
  load(project: Project): void {
    this.#project = project;
    this.#undo = [];
    this.#redo = [];
    this.#canCoalesce = false;
    this.#emit({ project, cause: 'load' });
  }

  /** Returns an unsubscribe function. */
  subscribe(listener: ChangeListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #commit(project: Project, cause: ChangeCause, label: string): void {
    this.#project = { ...project, modified: this.#now() };
    this.#emit({ project: this.#project, cause, label });
  }

  #emit(change: ProjectChange): void {
    for (const listener of this.#listeners) listener(change);
  }
}
