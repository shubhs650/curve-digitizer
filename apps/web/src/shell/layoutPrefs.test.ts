import { describe, expect, it } from 'vitest';
import {
  CANVAS_MIN_HEIGHT,
  clampDockHeight,
  DOCK_DEFAULT,
  DOCK_MIN,
  initialDock,
  initialSidebarOpen,
} from './layoutPrefs';

describe('layout preferences', () => {
  it('opens the dock on tall windows and keeps it collapsed on laptop heights', () => {
    expect(initialDock(1080, null)).toEqual({ open: true, height: DOCK_DEFAULT });
    expect(initialDock(768, null)).toEqual({ open: false, height: DOCK_DEFAULT });
  });

  it('restores what the user left, ignoring broken or out-of-range values', () => {
    expect(initialDock(768, '{"open":true,"height":300}')).toEqual({ open: true, height: 300 });
    expect(initialDock(1080, '{"open":false,"height":10}')).toEqual({ open: false, height: DOCK_MIN });
    expect(initialDock(1080, '{"height":"tall"}')).toEqual({ open: true, height: DOCK_DEFAULT });
    expect(initialDock(1080, 'not json')).toEqual({ open: true, height: DOCK_DEFAULT });
    expect(initialDock(1080, 'null')).toEqual({ open: true, height: DOCK_DEFAULT });
  });

  it('keeps the canvas at least its minimum height when the dock is dragged up', () => {
    expect(clampDockHeight(1000, 700, 36)).toBe(700 - 36 - CANVAS_MIN_HEIGHT);
    expect(clampDockHeight(40, 700, 36)).toBe(DOCK_MIN);
    expect(clampDockHeight(250.4, 700, 36)).toBe(250);
    // A window too short for both still gives the dock its minimum.
    expect(clampDockHeight(500, 200, 36)).toBe(DOCK_MIN);
  });

  it('hides the sidebar at startup below 1200 px wide', () => {
    expect(initialSidebarOpen(1366)).toBe(true);
    expect(initialSidebarOpen(1199)).toBe(false);
  });
});
