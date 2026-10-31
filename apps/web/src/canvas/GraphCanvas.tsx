import type { Graph } from '@cd/core';
import { Caption1, makeStyles, Spinner, tokens } from '@fluentui/react-components';
import { type PointerEvent as ReactPointerEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { calibratedReadout } from '../calibration/format';
import { usePreviewFit } from '../fit/fitStore';
import { useUiStore } from '../ui/uiStore';
import { Loupe } from './Loupe';
import { HIT_RADIUS, overlayModel, type OverlayState, paintOverlay, paintReference } from './overlay';
import { useReference } from '../reference/referenceStore';
import { type CanvasPointer, SELECT_TOOL, type ToolHandlers } from './tools';
import type { BitmapState } from './useGraphBitmap';
import {
  actualSizeView,
  fitView,
  panBy,
  type Size,
  toImage,
  type Vec2,
  type ViewTransform,
  wheelZoomFactor,
  ZOOM_STEP,
  zoomAt,
} from './viewTransform';
import { ZoomBar } from './ZoomBar';
import { useZoomTarget, type ZoomTarget } from './zoomTarget';

const useStyles = makeStyles({
  view: {
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    backgroundColor: tokens.colorNeutralBackground4,
  },
  layer: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
  },
  surface: {
    ':focus-visible': {
      outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: `calc(-1 * ${tokens.strokeWidthThick})`,
    },
  },
  status: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacingHorizontalL,
  },
  crosshair: {
    position: 'absolute',
    width: '21px',
    height: '21px',
    marginLeft: '-10px',
    marginTop: '-10px',
    pointerEvents: 'none',
    backgroundImage: `linear-gradient(${tokens.colorBrandStroke1}, ${tokens.colorBrandStroke1}), linear-gradient(${tokens.colorBrandStroke1}, ${tokens.colorBrandStroke1})`,
    backgroundSize: '1px 100%, 100% 1px',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  },
  readout: {
    position: 'absolute',
    left: tokens.spacingHorizontalS,
    bottom: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    fontVariantNumeric: 'tabular-nums',
    pointerEvents: 'none',
  },
});

/** Keyboard pan step in CSS px; Shift pans five times as far. */
const PAN_STEP = 40;
/** Keyboard crosshair step in image px; Shift moves ten times as far. */
const CROSSHAIR_STEP = 1;

const NO_SELECTION: ReadonlySet<string> = new Set();

export interface GraphCanvasProps {
  readonly graph: Graph;
  /** The graph's decoded image (`useGraphBitmap`); the caller owns it so tools can read its pixels. */
  readonly bitmapState: BitmapState;
  /** The active tool's primary-button behaviour; defaults to plain selection/hover. */
  readonly tool?: ToolHandlers;
  readonly selection?: ReadonlySet<string>;
  /** Draws the active tool's own marks over the points, in CSS px; keep it stable between renders. */
  readonly decorate?: (ctx: CanvasRenderingContext2D, view: ViewTransform) => void;
}

interface Drag {
  readonly kind: 'pan' | 'tool';
  readonly pointerId: number;
  last: Vec2;
}

/**
 * The graph image with zoom/pan, the overlay of points, hit-testing and the loupe (task 1.2). Rendering stays
 * on two canvases: the image layer redraws only when the view changes, the overlay on every hover too.
 */
export function GraphCanvas({
  graph,
  bitmapState,
  tool = SELECT_TOOL,
  selection = NO_SELECTION,
  decorate,
}: GraphCanvasProps) {
  const styles = useStyles();
  const helpId = useId();
  const bitmap = bitmapState.status === 'ready' ? bitmapState.bitmap : null;
  const panTool = useUiStore((s) => s.tool === 'pan');
  const loupeOn = useUiStore((s) => s.loupe);

  const container = useRef<HTMLDivElement>(null);
  const imageLayer = useRef<HTMLCanvasElement>(null);
  const overlayLayer = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState<Size | null>(null);
  const [view, setView] = useState<ViewTransform | null>(null);
  const [cursor, setCursor] = useState<Vec2 | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  /** The cursor is driven by the keyboard (Enter shows it, arrows move it, Enter clicks, Esc hides it). */
  const [keyCursor, setKeyCursor] = useState(false);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<Drag['kind'] | null>(null);

  const preview = usePreviewFit(graph.id);
  const reference = useReference(graph.id);
  const model = useMemo(() => overlayModel(graph, preview), [graph, preview]);
  const overlay = useMemo<OverlayState>(() => ({ hovered, selected: selection }), [hovered, selection]);
  const imageSize = graph.image;

  // Track the viewport; fit the image the first time both sizes are known.
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setViewport({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  // A fitted view stays fitted when the canvas changes size (dock or sidebar toggled, window resized); a view
  // the user zoomed or panned is left alone.
  const lastViewport = useRef<Size | null>(null);
  useEffect(() => {
    if (!viewport) return;
    const previous = lastViewport.current;
    lastViewport.current = viewport;
    setView((v) =>
      v === null || (previous !== null && sameView(v, fitView(imageSize, previous)))
        ? fitView(imageSize, viewport)
        : v,
    );
  }, [viewport, imageSize]);

  useLayerPaint(imageLayer, viewport, [bitmap, view, reference], (ctx) => {
    if (!bitmap || !view) return;
    // Square pixels once a pixel covers two screen pixels: exact positions matter more than smoothness there.
    ctx.imageSmoothingEnabled = view.scale < 2;
    ctx.drawImage(
      bitmap,
      view.offset[0],
      view.offset[1],
      bitmap.width * view.scale,
      bitmap.height * view.scale,
    );
    if (reference?.visible) paintReference(ctx, view, reference);
  });
  useLayerPaint(overlayLayer, viewport, [model, overlay, view, decorate], (ctx) => {
    if (!view) return;
    paintOverlay(ctx, view, model, overlay);
    decorate?.(ctx, view);
  });

  // Wheel zoom needs a non-passive listener to stop the page from scrolling.
  useEffect(() => {
    const element = overlayLayer.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      const anchor: Vec2 = [event.clientX - rect.left, event.clientY - rect.top];
      setView((v) => (v ? zoomAt(v, wheelZoomFactor(event.deltaY, event.deltaMode), anchor) : v));
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', onWheel);
    };
  }, []);

  const pointerAt = (
    screen: Vec2,
    v: ViewTransform,
    keys: { readonly shiftKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean },
  ): CanvasPointer => {
    const image = toImage(v, screen);
    return {
      screen,
      image,
      scale: v.scale,
      hit: model.hits.nearest(image, HIT_RADIUS / v.scale),
      shiftKey: keys.shiftKey,
      ctrlKey: keys.ctrlKey || keys.metaKey,
    };
  };

  const pointerFrom = (event: ReactPointerEvent<HTMLCanvasElement>, v: ViewTransform): CanvasPointer => {
    const rect = event.currentTarget.getBoundingClientRect();
    return pointerAt([event.clientX - rect.left, event.clientY - rect.top], v, event);
  };

  /**
   * Keyboard access to every tool (U2): Enter shows a crosshair, the arrow keys move it by 1 image px (Shift:
   * 10) with the loupe following, Enter clicks there, Esc hides it.
   */
  const onCrosshairKey = (event: React.KeyboardEvent<HTMLCanvasElement>): boolean => {
    if (!view || !viewport) return false;
    if (event.key === 'Enter') {
      if (!keyCursor || !cursor) {
        setKeyCursor(true);
        setCursor((c) => c ?? [viewport.width / 2, viewport.height / 2]);
        return true;
      }
      const pointer = pointerAt(cursor, view, event);
      if (tool.onDown?.(pointer) === true) tool.onUp?.(pointer);
      setHovered(pointer.hit?.key ?? null);
      return true;
    }
    if (!keyCursor || !cursor) return false;
    if (event.key === 'Escape') {
      setKeyCursor(false);
      setCursor(null);
      return true;
    }
    const step = (event.shiftKey ? 10 : 1) * CROSSHAIR_STEP * view.scale;
    const moves: Record<string, Vec2> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[event.key];
    if (!move) return false;
    const next: Vec2 = [
      Math.max(0, Math.min(viewport.width, cursor[0] + move[0])),
      Math.max(0, Math.min(viewport.height, cursor[1] + move[1])),
    ];
    setCursor(next);
    setHovered(pointerAt(next, view, event).hit?.key ?? null);
    return true;
  };

  const startDrag = (event: ReactPointerEvent<HTMLCanvasElement>, kind: Drag['kind'], at: Vec2) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind, pointerId: event.pointerId, last: at };
    setDragging(kind);
  };

  const endDrag = () => {
    drag.current = null;
    setDragging(null);
  };

  const zoomBy = (factor: number) => {
    if (viewport) setView((v) => (v ? zoomAt(v, factor, [viewport.width / 2, viewport.height / 2]) : v));
  };

  // Ctrl+wheel, pinch and Ctrl + / − / 0 zoom the graph, not the app (ADR 47).
  const zoomTarget = useMemo<ZoomTarget | null>(
    () =>
      viewport
        ? {
            zoomBy: (factor, anchor) => {
              const rect = overlayLayer.current?.getBoundingClientRect();
              const at: Vec2 =
                anchor && rect
                  ? [anchor.clientX - rect.left, anchor.clientY - rect.top]
                  : [viewport.width / 2, viewport.height / 2];
              setView((v) => (v ? zoomAt(v, factor, at) : v));
            },
            fit: () => {
              setView(fitView(imageSize, viewport));
            },
          }
        : null,
    [viewport, imageSize],
  );
  useZoomTarget(zoomTarget);

  const onKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (event.key === ' ') {
      event.preventDefault();
      setSpaceDown(true);
      return;
    }
    if (onCrosshairKey(event)) {
      event.preventDefault();
      return;
    }
    if (tool.onKeyDown?.(event.nativeEvent) === true) {
      event.preventDefault();
      return;
    }
    const step = event.shiftKey ? PAN_STEP * 5 : PAN_STEP;
    const pans: Record<string, Vec2> = {
      ArrowLeft: [step, 0],
      ArrowRight: [-step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const pan = pans[event.key];
    if (pan) {
      setView((v) => (v ? panBy(v, pan) : v));
    } else if (event.key === '+' || event.key === '=') {
      zoomBy(ZOOM_STEP);
    } else if (event.key === '-') {
      zoomBy(1 / ZOOM_STEP);
    } else if (event.key === '0' && viewport) {
      setView(fitView(imageSize, viewport));
    } else if (event.key === '1' && viewport) {
      setView(actualSizeView(imageSize, viewport));
    } else {
      return;
    }
    event.preventDefault();
  };

  const cursorImage = cursor && view ? toImage(view, cursor) : null;
  const cssCursor =
    dragging === 'pan'
      ? 'grabbing'
      : panTool || spaceDown
        ? 'grab'
        : hovered !== null
          ? 'pointer'
          : tool.cursor;

  return (
    <div ref={container} className={styles.view} data-view={view ? JSON.stringify(view) : undefined}>
      <canvas ref={imageLayer} className={styles.layer} aria-hidden="true" />
      <canvas
        ref={overlayLayer}
        className={`${styles.layer} ${styles.surface}`}
        style={{ cursor: cssCursor }}
        tabIndex={0}
        role="application"
        aria-roledescription="graph canvas"
        aria-label={`Graph image: ${graph.name}, ${String(graph.image.width)} × ${String(graph.image.height)} px`}
        aria-describedby={helpId}
        data-state={bitmapState.status}
        data-hovered={hovered ?? undefined}
        onPointerDown={(event) => {
          if (!view) return;
          event.currentTarget.focus();
          const pointer = pointerFrom(event, view);
          if (event.button === 1 || (event.button === 0 && (panTool || spaceDown))) {
            event.preventDefault();
            startDrag(event, 'pan', pointer.screen);
          } else if (event.button === 0 && tool.onDown?.(pointer) === true) {
            startDrag(event, 'tool', pointer.screen);
          }
        }}
        onPointerMove={(event) => {
          if (!view) return;
          const pointer = pointerFrom(event, view);
          setKeyCursor(false);
          setCursor(pointer.screen);
          const current = drag.current;
          if (current?.pointerId === event.pointerId && current.kind === 'pan') {
            const delta: Vec2 = [pointer.screen[0] - current.last[0], pointer.screen[1] - current.last[1]];
            current.last = pointer.screen;
            // Several moves can arrive before React re-renders; pan from the latest view, not this render's.
            setView((v) => (v ? panBy(v, delta) : v));
            return;
          }
          if (current?.pointerId === event.pointerId) tool.onDrag?.(pointer);
          setHovered(pointer.hit?.key ?? null);
        }}
        onPointerUp={(event) => {
          const current = drag.current;
          if (current?.pointerId !== event.pointerId || !view) return;
          if (current.kind === 'tool') tool.onUp?.(pointerFrom(event, view));
          endDrag();
        }}
        onPointerCancel={endDrag}
        onPointerLeave={() => {
          if (!drag.current && !keyCursor) {
            setCursor(null);
            setHovered(null);
          }
        }}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => {
          if (event.key === ' ') setSpaceDown(false);
        }}
        onBlur={() => {
          setSpaceDown(false);
          if (keyCursor) {
            setKeyCursor(false);
            setCursor(null);
          }
        }}
      />
      <span id={helpId} hidden>
        Mouse wheel or plus and minus keys zoom, zero fits the image, one shows actual size. Drag with the
        middle button, with Space held, or with the pan tool to pan; arrow keys pan too. Press Enter for a
        keyboard crosshair: arrow keys move it one pixel, Shift ten, Enter clicks with the current tool,
        Escape hides it.
      </span>
      {keyCursor && cursor && (
        <div
          className={styles.crosshair}
          style={{ left: `${String(cursor[0])}px`, top: `${String(cursor[1])}px` }}
          data-testid="keyboard-crosshair"
          aria-hidden="true"
        />
      )}
      {bitmap && view && viewport && cursor && cursorImage && loupeOn && dragging !== 'pan' && (
        <Loupe
          bitmap={bitmap}
          cursor={cursor}
          cursorImage={cursorImage}
          view={view}
          viewport={viewport}
          model={model}
          overlay={overlay}
        />
      )}
      {cursorImage && (
        <Caption1 className={styles.readout} data-testid="cursor-readout">
          x {cursorImage[0].toFixed(1)} px · y {cursorImage[1].toFixed(1)} px
          {graph.calibration !== null && ` · ${calibratedReadout(graph.calibration, cursorImage)}`}
        </Caption1>
      )}
      {view && viewport && (
        <ZoomBar
          scale={view.scale}
          onZoomIn={() => {
            zoomBy(ZOOM_STEP);
          }}
          onZoomOut={() => {
            zoomBy(1 / ZOOM_STEP);
          }}
          onFit={() => {
            setView(fitView(imageSize, viewport));
          }}
          onActualSize={() => {
            setView(actualSizeView(imageSize, viewport));
          }}
        />
      )}
      {bitmapState.status === 'loading' && (
        <div className={styles.status}>
          <Spinner label="Loading image…" />
        </div>
      )}
      {bitmapState.status === 'error' && (
        <div className={styles.status}>
          <Caption1 role="alert">Could not show this image: {bitmapState.message}</Caption1>
        </div>
      )}
    </div>
  );
}

function sameView(a: ViewTransform, b: ViewTransform): boolean {
  const close = (x: number, y: number) => Math.abs(x - y) < 1e-6;
  return close(a.scale, b.scale) && close(a.offset[0], b.offset[0]) && close(a.offset[1], b.offset[1]);
}

/**
 * Keeps a canvas the size of the viewport at device resolution and repaints it when `deps` change. The paint
 * callback draws in CSS px.
 */
function useLayerPaint(
  layer: React.RefObject<HTMLCanvasElement | null>,
  viewport: Size | null,
  deps: readonly unknown[],
  paint: (ctx: CanvasRenderingContext2D) => void,
): void {
  useEffect(() => {
    const element = layer.current;
    const ctx = element?.getContext('2d');
    if (!element || !ctx || !viewport) return;
    const ratio = window.devicePixelRatio;
    const width = Math.max(1, Math.round(viewport.width * ratio));
    const height = Math.max(1, Math.round(viewport.height * ratio));
    if (element.width !== width || element.height !== height) {
      element.width = width;
      element.height = height;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    paint(ctx);
    // `paint` is a fresh closure every render; `deps` lists what it reads.
  }, [layer, viewport, ...deps]);
}
