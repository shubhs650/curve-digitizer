import { describe, expect, it } from 'vitest';
import { isEditableTarget, readInputFiles } from './files';

describe('readInputFiles', () => {
  it('reads names and bytes', async () => {
    const files = await readInputFiles([new File([new Uint8Array([1, 2, 3])], 'a.png')]);
    expect(files).toEqual([{ name: 'a.png', bytes: new Uint8Array([1, 2, 3]) }]);
  });
});

describe('isEditableTarget', () => {
  it('is true for text fields only', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableTarget(document.createElement('div'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});
