import { afterEach, describe, expect, it, vi } from 'vitest';
import { CancelledError, createCancelFlag, isCancelFlagRaised, raiseCancelFlag } from './cancel.ts';

describe('cancel flag', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is a shared Int32Array that starts lowered and stays raised', () => {
    const flag = createCancelFlag();
    expect(flag).not.toBeNull();
    if (flag === null) return;
    expect(flag.buffer).toBeInstanceOf(SharedArrayBuffer);
    expect(isCancelFlagRaised(flag)).toBe(false);
    raiseCancelFlag(flag);
    raiseCancelFlag(flag);
    expect(isCancelFlagRaised(flag)).toBe(true);
  });

  it('is null when the page is not cross-origin isolated', () => {
    vi.stubGlobal('crossOriginIsolated', false);
    expect(createCancelFlag()).toBeNull();
  });

  it('is null when SharedArrayBuffer is unavailable', () => {
    vi.stubGlobal('SharedArrayBuffer', undefined);
    expect(createCancelFlag()).toBeNull();
  });

  it('CancelledError is recognisable after crossing a structured clone', () => {
    const error = new CancelledError();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('CancelledError');
  });
});
