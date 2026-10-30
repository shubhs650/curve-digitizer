import { describe, expect, it, vi } from 'vitest';
import type { WorkerClient } from './client.ts';
import { computePoolSize, WorkerPool } from './pool.ts';
import type { FakeTasks } from './testing/fake-tasks.ts';

/** Clients only need `pending`, `run` and `terminate` for scheduling, so stub them. */
function stubClient(pending: number) {
  const stub = {
    pending,
    run: vi.fn(() => {
      stub.pending++;
      return Promise.resolve({ status: 'done' as const, value: 0 });
    }),
    terminate: vi.fn(),
  };
  return stub;
}

describe('computePoolSize', () => {
  it('leaves one core for the main thread, with a minimum of one worker', () => {
    expect(computePoolSize(8)).toBe(7);
    expect(computePoolSize(2)).toBe(1);
    expect(computePoolSize(1)).toBe(1);
    expect(computePoolSize(undefined)).toBe(1);
  });
});

describe('WorkerPool', () => {
  it('sends each task to the least busy worker, lowest index on ties', async () => {
    const stubs = [stubClient(2), stubClient(0), stubClient(0)];
    const pool = new WorkerPool(stubs as unknown as WorkerClient<FakeTasks>[]);
    await pool.run('spin', { cap: 1 });
    await pool.run('spin', { cap: 1 });
    await pool.run('spin', { cap: 1 });
    expect(stubs.map((s) => s.run.mock.calls.length)).toEqual([0, 2, 1]);
  });

  it('passes options through to the chosen worker', async () => {
    const stub = stubClient(0);
    const pool = new WorkerPool([stub] as unknown as WorkerClient<FakeTasks>[]);
    const signal = new AbortController().signal;
    await pool.run('spin', { cap: 1 }, { signal });
    expect(stub.run).toHaveBeenCalledWith('spin', { cap: 1 }, { signal });
  });

  it('terminates every worker', () => {
    const stubs = [stubClient(0), stubClient(0)];
    new WorkerPool(stubs as unknown as WorkerClient<FakeTasks>[]).terminate();
    expect(stubs.every((s) => s.terminate.mock.calls.length === 1)).toBe(true);
  });

  it('needs at least one worker', () => {
    expect(() => new WorkerPool([])).toThrow(RangeError);
  });
});
