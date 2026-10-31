import type { Vec2 } from '@cd/core';
import { displaySize } from '@cd/pdf/geometry';
import { makeStyles, MessageBar, MessageBarBody, Spinner, tokens } from '@fluentui/react-components';
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { useProject, useWorkspace, useWorkspaceState } from '../session/context';
import type { CropPage } from '../ui/uiStore';
import { rectFromDisplay, rectToDisplayFractions, useCropDraft } from './cropDraft';

/** Longer side, in device pixels, of the page render the crop rectangle is drawn on. */
export const PAGE_VIEW_SIDE = 1600;

/** Space kept around the page inside the canvas area, CSS px. */
const MARGIN = 24;

const useStyles = makeStyles({
  stage: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colorNeutralBackground3,
  },
  page: {
    position: 'relative',
    flexShrink: 0,
    overflow: 'hidden',
    cursor: 'crosshair',
    touchAction: 'none',
    boxShadow: tokens.shadow8,
    backgroundColor: tokens.colorNeutralBackground1,
    ':focus-visible': {
      outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
    },
  },
  render: {
    display: 'block',
    width: '100%',
    height: '100%',
  },
  rect: {
    position: 'absolute',
    pointerEvents: 'none',
    border: `${tokens.strokeWidthThick} dashed ${tokens.colorBrandStroke1}`,
    // Dims everything outside the rectangle; the page's overflow clips the shadow.
    boxShadow: '0 0 0 100vmax rgba(0, 0, 0, 0.35)',
  },
});

/** A source PDF page in the canvas area, on which the user drags the crop rectangle (task 1.8). */
export function PdfPageView({ page }: { readonly page: CropPage }) {
  const styles = useStyles();
  const workspace = useWorkspace();
  const source = useProject()?.sources.find((s) => s.id === page.sourceId);
  const state = useWorkspaceState().pdf[page.sourceId];
  const geometry = state?.status === 'open' ? state.pages[page.pageIndex] : undefined;
  const rectPt = useCropDraft((s) => s.draft.rectPt);
  const update = useCropDraft((s) => s.update);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [stageSize, setStageSize] = useState<{ width: number; height: number } | null>(null);
  const [drag, setDrag] = useState<{ from: Vec2; to: Vec2 } | null>(null);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => {
      setStageSize({ width: element.clientWidth, height: element.clientHeight });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  const hasGeometry = geometry !== undefined;
  useEffect(() => {
    if (!hasGeometry) return;
    let live = true;
    setReady(false);
    workspace
      .renderThumbnail(page.sourceId, page.pageIndex, PAGE_VIEW_SIDE)
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
  }, [hasGeometry, workspace, page.sourceId, page.pageIndex]);

  if (state?.status === 'failed') {
    return (
      <div className={styles.stage}>
        <MessageBar intent="error">
          <MessageBarBody>{state.message}</MessageBarBody>
        </MessageBar>
      </div>
    );
  }

  const display = geometry ? displaySize(geometry) : null;
  const scale =
    display && stageSize
      ? Math.max(
          0.05,
          Math.min(
            (stageSize.width - 2 * MARGIN) / display.width,
            (stageSize.height - 2 * MARGIN) / display.height,
          ),
        )
      : 1;
  const box = display ? { width: display.width * scale, height: display.height * scale } : null;

  /** The pointer in display-space points. */
  const toDisplay = (event: PointerEvent<HTMLDivElement>): Vec2 => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return [(event.clientX - bounds.left) / scale, (event.clientY - bounds.top) / scale];
  };
  const shown = geometry && drag ? rectFromDisplay(geometry, drag.from, drag.to) : rectPt;
  const fractions = geometry && shown ? rectToDisplayFractions(geometry, shown) : null;
  const label = `Page ${String(page.pageIndex + 1)} of ${source?.fileName ?? 'PDF'}`;

  return (
    <div ref={stage} className={styles.stage}>
      {!geometry || !box ? (
        <Spinner label="Opening page…" />
      ) : (
        <div
          role="application"
          aria-label={`${label}: drag a rectangle around the graph to crop`}
          aria-roledescription="PDF page"
          tabIndex={0}
          className={styles.page}
          style={{ width: `${String(box.width)}px`, height: `${String(box.height)}px` }}
          data-ready={ready}
          data-testid="pdf-page"
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            const at = toDisplay(event);
            setDrag({ from: at, to: at });
          }}
          onPointerMove={(event) => {
            if (drag) setDrag({ from: drag.from, to: toDisplay(event) });
          }}
          onPointerUp={(event) => {
            if (!drag) return;
            const rect = rectFromDisplay(geometry, drag.from, toDisplay(event));
            setDrag(null);
            if (rect) update({ rectPt: rect });
          }}
          onPointerCancel={() => {
            setDrag(null);
          }}
        >
          <canvas ref={canvas} className={styles.render} aria-hidden="true" />
          {fractions && (
            <div
              className={styles.rect}
              data-testid="crop-rect"
              style={{
                left: `${String(fractions.left * 100)}%`,
                top: `${String(fractions.top * 100)}%`,
                width: `${String(fractions.width * 100)}%`,
                height: `${String(fractions.height * 100)}%`,
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
