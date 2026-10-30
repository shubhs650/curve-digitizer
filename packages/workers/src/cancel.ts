/** Thrown inside a task when its caller cancelled it; the runner turns it into a `cancelled` outcome. */
export class CancelledError extends Error {
  override readonly name = 'CancelledError';

  constructor() {
    super('Task cancelled');
  }
}

const RAISED = 1;

/**
 * A one-slot flag the main thread raises and a busy worker polls without yielding (docs/ARCHITECTURE.md §7).
 * `SharedArrayBuffer` only exists on cross-origin isolated pages, so this returns null elsewhere and
 * cancellation falls back to a message the worker sees at its next `checkpoint()`.
 */
export function createCancelFlag(): Int32Array | null {
  if (typeof SharedArrayBuffer !== 'function') return null;
  if ((globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === false) return null;
  return new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
}

export function raiseCancelFlag(flag: Int32Array): void {
  Atomics.store(flag, 0, RAISED);
}

export function isCancelFlagRaised(flag: Int32Array): boolean {
  return Atomics.load(flag, 0) === RAISED;
}
