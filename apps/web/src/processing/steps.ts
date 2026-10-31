import type { FilterStep } from '@cd/core';
import { FILTER_OP_NAMES, FILTER_OPS, type FilterOpName, isFilterOpName, parseStep } from '@cd/image';

// Pure edits of a pre-processing stack; the panel dispatches the result with setProcessing.

/** Ops in the order the Add filter menu lists them. */
export const MENU_OPS: readonly FilterOpName[] = FILTER_OP_NAMES;

export function opLabel(op: string): string {
  return isFilterOpName(op) ? FILTER_OPS[op].label : `Unknown filter "${op}"`;
}

export function newStep(op: FilterOpName): FilterStep {
  return { op, ...FILTER_OPS[op].defaults };
}

export function insertStep(stack: readonly FilterStep[], step: FilterStep): FilterStep[] {
  return [...stack, step];
}

export function removeStep(stack: readonly FilterStep[], index: number): FilterStep[] {
  return stack.filter((_, i) => i !== index);
}

/** Moves the step at `index` by `delta` places, clamped to the stack. */
export function moveStep(stack: readonly FilterStep[], index: number, delta: number): FilterStep[] {
  const to = Math.max(0, Math.min(stack.length - 1, index + delta));
  if (to === index || index < 0 || index >= stack.length) return [...stack];
  const next = [...stack];
  const [step] = next.splice(index, 1);
  if (step) next.splice(to, 0, step);
  return next;
}

/** Merges `patch` into the step's parameters; a key set to undefined is removed. */
export function updateStep(
  stack: readonly FilterStep[],
  index: number,
  patch: Readonly<Record<string, unknown>>,
): FilterStep[] {
  return stack.map((step, i) => {
    if (i !== index) return step;
    const merged = Object.entries({ ...step, ...patch }).filter(([, v]) => v !== undefined);
    return Object.fromEntries(merged) as FilterStep;
  });
}

/** Why a stored step will be skipped, or null when it runs. */
export function stepProblem(step: FilterStep): string | null {
  const result = parseStep(step);
  return result.ok ? null : result.message;
}

/** Whether the stack already turns light and dark round (so the dark-background hint is moot). */
export function hasInvert(stack: readonly FilterStep[]): boolean {
  return stack.some((s) => s.op === 'invert');
}
