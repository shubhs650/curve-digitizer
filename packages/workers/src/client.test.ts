import { expose } from 'comlink';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Progress } from './api.ts';
import { WorkerClient } from './client.ts';
import { createWorkerApi } from './runner.ts';
import { fakeTasks, steppingClock, type FakeTasks } from './testing/fake-tasks.ts';

/** A worker stand-in: the same Comlink protocol over a MessageChannel, on this thread. */
function connect(): WorkerClient<FakeTasks> {
  const channel = new MessageChannel();
  expose(createWorkerApi(fakeTasks, { now: steppingClock(1) }), channel.port1);
  return new WorkerClient<FakeTasks>(channel.port2);
}

const clients: WorkerClient<FakeTasks>[] = [];
function client(): WorkerClient<FakeTasks> {
  const c = connect();
  clients.push(c);
  return c;
}

afterEach(() => {
  for (const c of clients.splice(0)) c.terminate();
  vi.unstubAllGlobals();
});

describe('WorkerClient', () => {
  it('runs a fake task end to end with progress', async () => {
    const reports: Progress[] = [];
    const values = Float64Array.from({ length: 1000 }, () => 0.5);
    const outcome = await client().run('sum', { values }, { onProgress: (p) => reports.push(p) });
    expect(outcome.status).toBe('done');
    if (outcome.status !== 'done') return;
    expect(outcome.value.total).toBe(500);
    expect(outcome.value.running.at(-1)).toBe(500);
    expect(reports.length).toBeGreaterThan(0);
  });

  it('moves transferred input buffers instead of copying them', async () => {
    const values = new Float64Array(64);
    await client().run('sum', { values }, { transfer: [values.buffer] });
    expect(values.buffer.byteLength).toBe(0);
  });

  it('copies input buffers that are not listed for transfer', async () => {
    const values = new Float64Array(64);
    await client().run('sum', { values });
    expect(values.byteLength).toBe(64 * 8);
  });

  it('cancels a running task through AbortSignal', async () => {
    const controller = new AbortController();
    const c = client();
    const outcome = await c.run(
      'spin',
      { cap: 100_000 },
      {
        signal: controller.signal,
        onProgress: (p) => {
          if (p.fraction > 0) controller.abort();
        },
      },
    );
    expect(outcome).toEqual({ status: 'cancelled' });
    expect(c.pending).toBe(0);
  });

  it('cancels without SharedArrayBuffer when the page is not cross-origin isolated', async () => {
    vi.stubGlobal('crossOriginIsolated', false);
    const controller = new AbortController();
    const outcome = await client().run(
      'spin',
      { cap: 100_000 },
      {
        signal: controller.signal,
        onProgress: () => {
          controller.abort();
        },
      },
    );
    expect(outcome).toEqual({ status: 'cancelled' });
  });

  it('does not start a task whose signal is already aborted', async () => {
    const outcome = await client().run('spin', { cap: 3 }, { signal: AbortSignal.abort() });
    expect(outcome).toEqual({ status: 'cancelled' });
  });

  it('counts pending tasks while they run', async () => {
    const c = client();
    const running = c.run('spin', { cap: 50 });
    expect(c.pending).toBe(1);
    await running;
    expect(c.pending).toBe(0);
  });

  it('rejects with the task error message', async () => {
    await expect(client().run('fail', { message: 'no curve here' })).rejects.toThrow('no curve here');
  });

  it('rejects in-flight tasks when terminated', async () => {
    const c = connect();
    const running = c.run('spin', { cap: 1e9 });
    c.terminate();
    await expect(running).rejects.toThrow('Worker terminated');
    await expect(c.run('spin', { cap: 1 })).rejects.toThrow('Worker terminated');
  });
});
