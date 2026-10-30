import { describe, expect, it } from 'vitest';
import { packageName } from './index.ts';

describe('@cd/trace', () => {
  it('exposes its package name', () => {
    expect(packageName).toBe('@cd/trace');
  });
});
