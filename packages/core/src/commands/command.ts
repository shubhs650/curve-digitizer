import type { Project } from '../types.ts';

/**
 * An invertible project mutation. Commands are pure: `apply` returns a new project and never
 * mutates its input, so the store can keep old projects as-is.
 *
 * `invert(before)` returns the command that, applied to `apply(before)`, gives back `before`.
 * Taking the pre-apply project lets a command capture whatever it is about to destroy (a removed
 * graph and its index, an old name) without holding mutable state of its own.
 */
export interface Command {
  readonly label: string;
  /**
   * Consecutive dispatches with the same key merge into one undo step. Callers make the key unique
   * per gesture (e.g. include a drag id) so two separate drags stay two steps.
   */
  readonly coalesceKey?: string;
  apply(project: Project): Project;
  invert(before: Project): Command;
}

/** Raised when a command cannot apply to the given project (e.g. an unknown id). */
export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandError';
  }
}
