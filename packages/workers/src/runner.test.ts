import { describe, expect, it, vi } from 'vitest';
import type { Progress, TaskRequest } from './api.ts';
import { createCancelFlag, raiseCancelFlag } from './cancel.ts';
import { createWorkerApi } from './runner.ts';
import { fakeTasks, steppingClock } from './testing/fake-tasks.ts';

function request(
  id: number,
  name: string,
  input: unknown,
  cancelFlag: Int32Array | null = null,
): TaskRequest {
  return { id, name, input, cancelFlag };
}

describe('createWorkerApi', () => {
  it('runs a task and returns its value', async () => {
    const api = createWorkerApi(fakeTasks);
    const values = Float64Array.from({ length: 100 }, (_, i) => i);
    const outcome = await api.run(request(1, 'sum', { values }), undefined);
    expect(outcome.status).toBe('done');
    expect(outcome.status === 'done' && (outcome.value as { total: number }).total).toBe(4950);
  });

  it('throttles progress to one report per interval and always reports completion', async () => {
    // Each clock read advances 1 ms; 1000 values give ~63 progress calls, far fewer reports.
    const api = createWorkerApi(fakeTasks, { now: steppingClock(1) });
    const reports: Progress[] = [];
    const values = new Float64Array(1000);
    await api.run(request(1, 'sum', { values }), (p) => reports.push(p));
    expect(reports.length).toBeGreaterThan(1);
    expect(reports.length).toBeLessThan(63);
    expect(reports.at(-1)).toEqual({ fraction: 1 });
    const fractions = reports.map((p) => p.fraction);
    expect(fractions).toEqual([...fractions].sort((a, b) => a - b));
  });

  it('clamps progress into [0, 1]', async () => {
    const reports: Progress[] = [];
    const api = createWorkerApi({
      odd: {
        run(_: undefined, ctx) {
          ctx.progress(-1, 'start');
          ctx.progress(Number.NaN);
          ctx.progress(7);
        },
      },
    });
    await api.run(request(1, 'odd', undefined), (p) => reports.push(p));
    expect(reports).toEqual([{ fraction: 0, message: 'start' }, { fraction: 1 }]);
  });

  it('returns cancelled without running when the flag is already raised', async () => {
    const run = vi.fn();
    const api = createWorkerApi({ watched: { run } });
    const flag = createCancelFlag();
    if (flag === null) throw new Error('SharedArrayBuffer expected in tests');
    raiseCancelFlag(flag);
    expect(await api.run(request(1, 'watched', undefined, flag), undefined)).toEqual({ status: 'cancelled' });
    expect(run).not.toHaveBeenCalled();
  });

  it('stops a tight synchronous loop at the next check after the shared flag is raised', async () => {
    const api = createWorkerApi(fakeTasks);
    const flag = createCancelFlag();
    if (flag === null) throw new Error('SharedArrayBuffer expected in tests');
    const outcome = await api.run(request(1, 'raiseFlagAt', { at: 10, flag, cap: 1e6 }, flag), undefined);
    expect(outcome).toEqual({ status: 'cancelled' });
  });

  it('without a shared flag, yields during checkpoints so a cancel message can arrive', async () => {
    const api = createWorkerApi(fakeTasks, { now: steppingClock(1) });
    const running = api.run(request(7, 'spin', { cap: 10_000 }), undefined);
    // Delivered as a separate macrotask, as a Comlink message would be.
    setTimeout(() => {
      api.cancel(7);
    }, 0);
    expect(await running).toEqual({ status: 'cancelled' });
  });

  it('ignores a cancel for a task that is not running', async () => {
    const api = createWorkerApi(fakeTasks);
    api.cancel(42);
    const outcome = await api.run(request(42, 'spin', { cap: 3 }), undefined);
    expect(outcome).toEqual({ status: 'done', value: 3 });
  });

  it('rejects unknown task names, including inherited object keys', async () => {
    const api = createWorkerApi(fakeTasks);
    await expect(api.run(request(1, 'nope', undefined), undefined)).rejects.toThrow('Unknown task "nope"');
    await expect(api.run(request(2, 'toString', undefined), undefined)).rejects.toThrow(
      'Unknown task "toString"',
    );
  });

  it('propagates task errors as rejections', async () => {
    const api = createWorkerApi(fakeTasks);
    await expect(api.run(request(1, 'fail', { message: 'bad input' }), undefined)).rejects.toThrow(
      'bad input',
    );
  });
});
