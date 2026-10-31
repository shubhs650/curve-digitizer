import { type RefObject, useEffect } from 'react';
import { wheelZoomFactor } from './viewTransform';

// Browser zoom gestures over the canvas area zoom the page or graph shown there, as in a PDF viewer (ADR 47):
// Ctrl+wheel (and trackpad pinch, which Chromium reports as Ctrl+wheel) at the pointer, Ctrl + / Ctrl − / Ctrl 0
// anywhere while a page or graph is shown. Over the side panels Ctrl+wheel still zooms the app, which people
// rely on for accessibility.

/** What the canvas area currently shows, as far as zooming goes. */
export interface ZoomTarget {
  /** Zooms by `factor`, keeping the point under `anchor` (viewport px) still; the view's centre by default. */
  readonly zoomBy: (factor: number, anchor?: { readonly clientX: number; readonly clientY: number }) => void;
  readonly fit: () => void;
}

export type ZoomCommand = 'in' | 'out' | 'fit';

/** One Ctrl + / Ctrl − step. */
export const KEY_ZOOM_STEP = 1.25;

const targets: ZoomTarget[] = [];

/** Makes `target` receive zoom gestures until the returned function is called; the latest one wins. */
export function registerZoomTarget(target: ZoomTarget): () => void {
  targets.push(target);
  return () => {
    const i = targets.lastIndexOf(target);
    if (i >= 0) targets.splice(i, 1);
  };
}

export function activeZoomTarget(): ZoomTarget | undefined {
  return targets[targets.length - 1];
}

/** The browser zoom shortcut a key press is, if any. */
export function zoomKey(event: {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}): ZoomCommand | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  switch (event.key) {
    case '+':
    case '=':
      return 'in';
    case '-':
    case '_':
      return 'out';
    case '0':
      return 'fit';
    default:
      return null;
  }
}

export function runZoomCommand(target: ZoomTarget, command: ZoomCommand): void {
  if (command === 'fit') target.fit();
  else target.zoomBy(command === 'in' ? KEY_ZOOM_STEP : 1 / KEY_ZOOM_STEP);
}

/** Registers `target` while the component is mounted. Keep it stable (useMemo) or it re-registers every render. */
export function useZoomTarget(target: ZoomTarget | null): void {
  useEffect(() => (target ? registerZoomTarget(target) : undefined), [target]);
}

/** Routes Ctrl+wheel over `area` and the Ctrl zoom keys anywhere to the active zoom target. */
export function useZoomCapture(area: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const element = area.current;
    if (!element) return;
    // Non-passive: a passive listener cannot stop the browser zooming the whole app.
    const onWheel = (event: WheelEvent) => {
      if (event.defaultPrevented || !(event.ctrlKey || event.metaKey)) return;
      const target = activeZoomTarget();
      if (!target) return;
      event.preventDefault();
      target.zoomBy(wheelZoomFactor(event.deltaY, event.deltaMode), event);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const command = zoomKey(event);
      const target = activeZoomTarget();
      if (!command || !target) return;
      event.preventDefault();
      runZoomCommand(target, command);
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('keydown', onKeyDown);
    return () => {
      element.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [area]);
}
