import type { Vec2 } from '@cd/core';
import { capDpi, cropPixelSize, displaySize } from '@cd/pdf/geometry';
import {
  Caption1,
  makeStyles,
  MessageBar,
  MessageBarBody,
  Spinner,
  tokens,
} from '@fluentui/react-components';
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ZoomBar } from '../canvas/ZoomBar';
import { useZoomTarget, type ZoomTarget } from '../canvas/zoomTarget';
import { useProject, useWorkspace, useWorkspaceState } from '../session/context';
import type { CropPage } from '../ui/uiStore';
import {
  cropRotation,
  type DisplayRect,
  type Handle,
  HANDLES,
  moveRect,
  rectFromDisplay,
  rectToDisplayFractions,
  resizeRect,
  useCropDraft,
} from './cropDraft';

/** Longer side, in device pixels, of the first page render; zooming in asks for sharper ones up to the cap. */
export const PAGE_VIEW_SIDE = 1600;
/** Sharper renders for zoomed views, longest side in device px; a page is rendered whole, so this is capped. */
const RENDER_SIDES = [PAGE_VIEW_SIDE, 2400, 3200] as const;
const MAX_RENDER_SIDE = 3200;

/** Space kept around the page inside the canvas area, CSS px. */
const MARGIN = 24;
/** CSS px per PDF point at 100 % (CSS has 96 px per inch, PDF 72 points). */
const ACTUAL_SIZE = 96 / 72;
/** Zoom range, CSS px per point. */
const MIN_SCALE = 0.05;
const MAX_SCALE = 8 * ACTUAL_SIZE;
const ZOOM_STEP = 1.25;
/** Keyboard pan step, CSS px. */
const PAN_STEP = 40;

const useStyles = makeStyles({
  root: {
    position: 'absolute',
    inset: 0,
    backgroundColor: tokens.colorNeutralBackground4,
  },
  stage: {
    position: 'absolute',
    inset: 0,
    overflow: 'auto',
  },
  centre: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  page: {
    position: 'absolute',
    cursor: 'crosshair',
    touchAction: 'none',
    boxShadow: tokens.shadow16,
    backgroundColor: '#ffffff',
    ':focus-visible': {
      outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: '2px',
    },
  },
  panning: {
    cursor: 'grab',
  },
  render: {
    display: 'block',
    width: '100%',
    height: '100%',
  },
  dim: {
    position: 'absolute',
    pointerEvents: 'none',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  rect: {
    position: 'absolute',
    boxSizing: 'border-box',
    cursor: 'move',
    border: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`,
    // A light hairline outside the brand line keeps the edge visible on dark charts.
    outline: `${tokens.strokeWidthThin} solid rgba(255, 255, 255, 0.9)`,
  },
  handle: {
    position: 'absolute',
    width: '10px',
    height: '10px',
    marginLeft: '-5px',
    marginTop: '-5px',
    boxSizing: 'border-box',
    borderRadius: tokens.borderRadiusSmall,
    border: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`,
    backgroundColor: '#ffffff',
  },
  size: {
    position: 'absolute',
    left: 0,
    bottom: '100%',
    marginBottom: tokens.spacingVerticalXS,
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusMedium,
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
    color: tokens.colorNeutralForegroundOnBrand,
    backgroundColor: tokens.colorBrandBackground,
    fontVariantNumeric: 'tabular-nums',
  },
  hint: {
    position: 'absolute',
    top: tokens.spacingVerticalM,
    left: '50%',
    transform: 'translateX(-50%)',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusCircular,
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
  },
});

const HANDLE_CURSORS: Record<Handle, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
};

/** Where each handle sits on the rectangle, as fractions of its width and height. */
const HANDLE_AT: Record<Handle, Vec2> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  e: [1, 0.5],
  se: [1, 1],
  s: [0.5, 1],
  sw: [0, 1],
  w: [0, 0.5],
};

type Gesture =
  | { readonly kind: 'draw'; readonly pointerId: number; readonly from: Vec2 }
  | { readonly kind: 'move'; readonly pointerId: number; readonly from: Vec2; readonly start: DisplayRect }
  | {
      readonly kind: 'resize';
      readonly pointerId: number;
      readonly from: Vec2;
      readonly start: DisplayRect;
      readonly handle: Handle;
    }
  | { readonly kind: 'pan'; readonly pointerId: number; readonly last: Vec2 };

const clampScale = (scale: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));

/**
 * A source PDF page in the canvas area, on which the user drags the crop rectangle (task 1.8): zoom and pan
 * like a PDF viewer, and a rectangle with handles that can be moved and resized (ADR 47).
 */
export function PdfPageView({ page }: { readonly page: CropPage }) {
  const styles = useStyles();
  const workspace = useWorkspace();
  const source = useProject()?.sources.find((s) => s.id === page.sourceId);
  const state = useWorkspaceState().pdf[page.sourceId];
  const geometry = state?.status === 'open' ? state.pages[page.pageIndex] : undefined;
  const draft = useCropDraft((s) => s.draft);
  const update = useCropDraft((s) => s.update);
  const stage = useRef<HTMLDivElement>(null);
  const pageBox = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);
  /** CSS px per point; 'fit' follows the stage size. */
  const [zoom, setZoom] = useState<number | 'fit'>('fit');
  // The gesture lives in a ref: several pointer moves can arrive before React re-renders (see GraphCanvas).
  const gesture = useRef<Gesture | null>(null);
  const [gestureKind, setGestureKind] = useState<Gesture['kind'] | null>(null);
  /** The rectangle while a gesture changes it, display points. */
  const [live, setLive] = useState<DisplayRect | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [renderSide, setRenderSide] = useState<number>(PAGE_VIEW_SIDE);
  /** The page point to keep under the pointer after a zoom, as fractions of the page, and where it was. */
  const anchor = useRef<{ fx: number; fy: number; clientX: number; clientY: number } | null>(null);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => {
      setStageSize({ width: element.clientWidth, height: element.clientHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  const display = geometry ? displaySize(geometry) : null;
  const fitScale =
    display && stageSize
      ? clampScale(
          Math.min(
            (stageSize.width - 2 * MARGIN) / display.width,
            (stageSize.height - 2 * MARGIN) / display.height,
          ),
        )
      : 1;
  const scale = zoom === 'fit' ? fitScale : zoom;
  const box = display ? { width: display.width * scale, height: display.height * scale } : null;

  // Sharper renders as the page grows on screen; never smaller than the first one.
  const wantedSide: number = box
    ? (RENDER_SIDES.find((side) => side >= Math.max(box.width, box.height) * window.devicePixelRatio) ??
      MAX_RENDER_SIDE)
    : PAGE_VIEW_SIDE;
  useEffect(() => {
    if (wantedSide <= renderSide) return;
    const timer = setTimeout(() => {
      setRenderSide(wantedSide);
    }, 200);
    return () => {
      clearTimeout(timer);
    };
  }, [wantedSide, renderSide]);

  const hasGeometry = geometry !== undefined;
  useEffect(() => {
    if (!hasGeometry) return;
    let live = true;
    workspace
      .renderThumbnail(page.sourceId, page.pageIndex, renderSide)
      .then((image) => {
        const element = canvas.current;
        const context = element?.getContext('2d');
        if (!live || !element || !context) return;
        element.width = image.width;
        element.height = image.height;
        context.putImageData(new ImageData(new Uint8ClampedArray(image.rgba.buffer), image.width), 0, 0);
        setReady(true);
      })
      .catch(() => {
        // The document was closed (project switched) before the page arrived; nothing to show.
      });
    return () => {
      live = false;
    };
  }, [hasGeometry, workspace, page.sourceId, page.pageIndex, renderSide]);

  const zoomTarget = useMemo<ZoomTarget>(
    () => ({
      zoomBy: (factor, at) => {
        const element = pageBox.current;
        const view = stage.current;
        if (!element || !view) return;
        const rect = element.getBoundingClientRect();
        const bounds = view.getBoundingClientRect();
        const clientX = at?.clientX ?? bounds.left + bounds.width / 2;
        const clientY = at?.clientY ?? bounds.top + bounds.height / 2;
        anchor.current = {
          fx: (clientX - rect.left) / rect.width,
          fy: (clientY - rect.top) / rect.height,
          clientX,
          clientY,
        };
        setZoom(clampScale((rect.width / (display?.width ?? rect.width)) * factor));
      },
      fit: () => {
        anchor.current = null;
        setZoom('fit');
      },
    }),
    [display?.width],
  );
  useZoomTarget(zoomTarget);

  // After a zoom, scroll so the anchored page point is back under the pointer.
  useLayoutEffect(() => {
    const target = anchor.current;
    const element = pageBox.current;
    const view = stage.current;
    if (!target || !element || !view) return;
    anchor.current = null;
    const rect = element.getBoundingClientRect();
    view.scrollLeft += rect.left + target.fx * rect.width - target.clientX;
    view.scrollTop += rect.top + target.fy * rect.height - target.clientY;
  }, [scale]);

  if (state?.status === 'failed') {
    return (
      <div className={styles.root}>
        <div className={styles.centre}>
          <MessageBar intent="error">
            <MessageBarBody>{state.message}</MessageBarBody>
          </MessageBar>
        </div>
      </div>
    );
  }

  /** The pointer in display-space points. */
  const toDisplay = (event: PointerEvent<HTMLDivElement>): Vec2 => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return [(event.clientX - bounds.left) / scale, (event.clientY - bounds.top) / scale];
  };
  const saved: DisplayRect | null =
    geometry && display && draft.rectPt
      ? fractionsToRect(rectToDisplayFractions(geometry, draft.rectPt), display)
      : null;
  const shown = live ?? saved;
  const shownPt =
    geometry && shown
      ? rectFromDisplay(geometry, [shown.left, shown.top], [shown.right, shown.bottom])
      : null;
  const capped = shownPt ? capDpi(shownPt, draft.dpi) : null;
  const pixels =
    shownPt && capped && geometry
      ? cropPixelSize(shownPt, capped.dpi, cropRotation(geometry, draft.turn))
      : null;
  const label = `Page ${String(page.pageIndex + 1)} of ${source?.fileName ?? 'PDF'}`;
  const panning = spaceDown || gestureKind === 'pan';

  const content = box
    ? {
        width: Math.max(stageSize?.width ?? 0, box.width + 2 * MARGIN),
        height: Math.max(stageSize?.height ?? 0, box.height + 2 * MARGIN),
      }
    : null;

  const begin = (next: Gesture) => {
    gesture.current = next;
    setGestureKind(next.kind);
  };
  const end = () => {
    gesture.current = null;
    setGestureKind(null);
    setLive(null);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!display) return;
    event.currentTarget.focus();
    if (event.button === 1 || (event.button === 0 && spaceDown)) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      begin({ kind: 'pan', pointerId: event.pointerId, last: [event.clientX, event.clientY] });
      return;
    }
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const at = toDisplay(event);
    const target = event.target as HTMLElement;
    const handle = target.dataset.handle as Handle | undefined;
    if (saved && handle) {
      begin({ kind: 'resize', pointerId: event.pointerId, from: at, start: saved, handle });
    } else if (saved && target.dataset.cropRect !== undefined) {
      begin({ kind: 'move', pointerId: event.pointerId, from: at, start: saved });
    } else {
      begin({ kind: 'draw', pointerId: event.pointerId, from: at });
      setLive(null);
    }
  };

  /** The rectangle the current gesture makes with the pointer at `event`. */
  const gestureRect = (current: Gesture, event: PointerEvent<HTMLDivElement>): DisplayRect | null => {
    if (!display || current.kind === 'pan') return null;
    const at = toDisplay(event);
    if (current.kind === 'draw') return spanRect(current.from, at, display);
    if (current.kind === 'move') return moveRect(current.start, sub(at, current.from), display);
    return resizeRect(current.start, current.handle, sub(at, current.from), display);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (current?.pointerId !== event.pointerId) return;
    if (current.kind === 'pan') {
      const view = stage.current;
      if (view) {
        view.scrollLeft -= event.clientX - current.last[0];
        view.scrollTop -= event.clientY - current.last[1];
      }
      gesture.current = { ...current, last: [event.clientX, event.clientY] };
      return;
    }
    setLive(gestureRect(current, event));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (current?.pointerId !== event.pointerId) return;
    const final = gestureRect(current, event);
    end();
    if (!final || !geometry) return;
    const rect = rectFromDisplay(geometry, [final.left, final.top], [final.right, final.bottom]);
    // A click (no drag) on the page leaves the rectangle as it was.
    if (rect) update({ rectPt: rect });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const view = stage.current;
    const pans: Record<string, Vec2> = {
      ArrowLeft: [-PAN_STEP, 0],
      ArrowRight: [PAN_STEP, 0],
      ArrowUp: [0, -PAN_STEP],
      ArrowDown: [0, PAN_STEP],
    };
    const pan = pans[event.key];
    if (event.key === ' ') {
      setSpaceDown(true);
    } else if (event.key === 'Escape' && draft.rectPt) {
      update({ rectPt: null });
    } else if (pan && view) {
      view.scrollLeft += pan[0];
      view.scrollTop += pan[1];
    } else if ((event.key === '+' || event.key === '=') && !event.ctrlKey && !event.metaKey) {
      zoomTarget.zoomBy(ZOOM_STEP);
    } else if (event.key === '-' && !event.ctrlKey && !event.metaKey) {
      zoomTarget.zoomBy(1 / ZOOM_STEP);
    } else if (event.key === '0' && !event.ctrlKey && !event.metaKey) {
      zoomTarget.fit();
    } else {
      return;
    }
    event.preventDefault();
  };

  const fractions = shown && display ? rectToFractions(shown, display) : null;

  return (
    <div className={styles.root}>
      <div ref={stage} className={styles.stage} data-testid="pdf-stage">
        {!geometry || !box || !content ? (
          <div className={styles.centre}>
            <Spinner label="Opening page…" />
          </div>
        ) : (
          <div
            style={{
              position: 'relative',
              width: `${String(content.width)}px`,
              height: `${String(content.height)}px`,
            }}
          >
            <div
              ref={pageBox}
              role="application"
              aria-label={`${label}: drag a rectangle around the graph to crop`}
              aria-roledescription="PDF page"
              aria-keyshortcuts="Escape"
              tabIndex={0}
              className={panning ? `${styles.page} ${styles.panning}` : styles.page}
              style={{
                left: `${String((content.width - box.width) / 2)}px`,
                top: `${String((content.height - box.height) / 2)}px`,
                width: `${String(box.width)}px`,
                height: `${String(box.height)}px`,
              }}
              data-ready={ready}
              data-scale={scale}
              data-testid="pdf-page"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={end}
              onKeyDown={onKeyDown}
              onKeyUp={(event) => {
                if (event.key === ' ') setSpaceDown(false);
              }}
              onBlur={() => {
                setSpaceDown(false);
              }}
            >
              <canvas ref={canvas} className={styles.render} aria-hidden="true" />
              {fractions && (
                <>
                  <Dim fractions={fractions} className={styles.dim} />
                  <div
                    className={styles.rect}
                    data-testid="crop-rect"
                    data-crop-rect=""
                    style={{
                      left: pct(fractions.left),
                      top: pct(fractions.top),
                      width: pct(fractions.width),
                      height: pct(fractions.height),
                    }}
                  >
                    {pixels && (
                      <Caption1 className={styles.size} data-testid="crop-rect-size">
                        {pixels.width} × {pixels.height} px
                      </Caption1>
                    )}
                    {gestureKind !== 'draw' &&
                      HANDLES.map((handle) => (
                        <div
                          key={handle}
                          className={styles.handle}
                          data-handle={handle}
                          data-testid={`crop-handle-${handle}`}
                          style={{
                            left: pct(HANDLE_AT[handle][0]),
                            top: pct(HANDLE_AT[handle][1]),
                            cursor: HANDLE_CURSORS[handle],
                          }}
                        />
                      ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      {geometry && !draft.rectPt && !live && (
        <Caption1 className={styles.hint} data-testid="crop-hint">
          Drag a rectangle around the graph
        </Caption1>
      )}
      {box && (
        <ZoomBar
          scale={scale / ACTUAL_SIZE}
          onZoomIn={() => {
            zoomTarget.zoomBy(ZOOM_STEP);
          }}
          onZoomOut={() => {
            zoomTarget.zoomBy(1 / ZOOM_STEP);
          }}
          onFit={zoomTarget.fit}
          onActualSize={() => {
            anchor.current = null;
            setZoom(ACTUAL_SIZE);
          }}
        />
      )}
    </div>
  );
}

interface Fractions {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Darkens the page outside the rectangle; four bands, so the page itself needs no clipping. */
function Dim({ fractions: f, className }: { readonly fractions: Fractions; readonly className: string }) {
  const bands: readonly Fractions[] = [
    { left: 0, top: 0, width: 1, height: f.top },
    { left: 0, top: f.top + f.height, width: 1, height: 1 - f.top - f.height },
    { left: 0, top: f.top, width: f.left, height: f.height },
    { left: f.left + f.width, top: f.top, width: 1 - f.left - f.width, height: f.height },
  ];
  return (
    <>
      {bands.map((b, i) => (
        <div
          key={i}
          aria-hidden="true"
          className={className}
          style={{ left: pct(b.left), top: pct(b.top), width: pct(b.width), height: pct(b.height) }}
        />
      ))}
    </>
  );
}

const pct = (fraction: number) => `${String(fraction * 100)}%`;
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];

function spanRect(a: Vec2, b: Vec2, size: { width: number; height: number }): DisplayRect {
  const clampX = (x: number) => Math.min(size.width, Math.max(0, x));
  const clampY = (y: number) => Math.min(size.height, Math.max(0, y));
  return {
    left: clampX(Math.min(a[0], b[0])),
    top: clampY(Math.min(a[1], b[1])),
    right: clampX(Math.max(a[0], b[0])),
    bottom: clampY(Math.max(a[1], b[1])),
  };
}

function fractionsToRect(f: Fractions, size: { width: number; height: number }): DisplayRect {
  return {
    left: f.left * size.width,
    top: f.top * size.height,
    right: (f.left + f.width) * size.width,
    bottom: (f.top + f.height) * size.height,
  };
}

function rectToFractions(r: DisplayRect, size: { width: number; height: number }): Fractions {
  return {
    left: r.left / size.width,
    top: r.top / size.height,
    width: (r.right - r.left) / size.width,
    height: (r.bottom - r.top) / size.height,
  };
}
