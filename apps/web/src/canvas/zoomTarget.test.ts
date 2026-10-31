import { describe, expect, it, vi } from 'vitest';
import { activeZoomTarget, KEY_ZOOM_STEP, registerZoomTarget, runZoomCommand, zoomKey } from './zoomTarget';

const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...mods,
});

describe('zoom capture', () => {
  it('recognises the browser zoom shortcuts with Ctrl or Cmd only', () => {
    expect(zoomKey(key('=', { ctrlKey: true }))).toBe('in');
    expect(zoomKey(key('+', { metaKey: true }))).toBe('in');
    expect(zoomKey(key('-', { ctrlKey: true }))).toBe('out');
    expect(zoomKey(key('0', { ctrlKey: true }))).toBe('fit');
    expect(zoomKey(key('='))).toBeNull();
    expect(zoomKey(key('0', { ctrlKey: true, altKey: true }))).toBeNull();
    expect(zoomKey(key('s', { ctrlKey: true }))).toBeNull();
  });

  it('sends gestures to the latest registered target until it unregisters', () => {
    const first = { zoomBy: vi.fn(), fit: vi.fn() };
    const second = { zoomBy: vi.fn(), fit: vi.fn() };
    const offFirst = registerZoomTarget(first);
    const offSecond = registerZoomTarget(second);
    expect(activeZoomTarget()).toBe(second);
    offSecond();
    expect(activeZoomTarget()).toBe(first);
    offFirst();
    expect(activeZoomTarget()).toBeUndefined();
  });

  it('runs a command as one zoom step or a fit', () => {
    const target = { zoomBy: vi.fn(), fit: vi.fn() };
    runZoomCommand(target, 'in');
    runZoomCommand(target, 'out');
    runZoomCommand(target, 'fit');
    expect(target.zoomBy).toHaveBeenNthCalledWith(1, KEY_ZOOM_STEP);
    expect(target.zoomBy).toHaveBeenNthCalledWith(2, 1 / KEY_ZOOM_STEP);
    expect(target.fit).toHaveBeenCalledOnce();
  });
});
