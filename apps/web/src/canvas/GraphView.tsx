import type { Graph } from '@cd/core';
import { Caption1, makeStyles, Spinner, tokens } from '@fluentui/react-components';
import { useEffect, useRef } from 'react';
import { useGraphBitmap } from './useGraphBitmap';

const useStyles = makeStyles({
  view: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  canvas: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
  },
  status: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacingHorizontalL,
  },
});

/** Shows the graph image fitted to the canvas region. */
export function GraphView({ graph }: { graph: Graph }) {
  const styles = useStyles();
  const state = useGraphBitmap(graph);
  const canvas = useRef<HTMLCanvasElement>(null);
  const bitmap = state.status === 'ready' ? state.bitmap : null;

  useEffect(() => {
    const element = canvas.current;
    if (!element || !bitmap) return;
    const draw = () => {
      const ratio = window.devicePixelRatio;
      const width = Math.max(1, Math.round(element.clientWidth * ratio));
      const height = Math.max(1, Math.round(element.clientHeight * ratio));
      element.width = width;
      element.height = height;
      const context = element.getContext('2d');
      if (!context) return;
      const scale = Math.min(width / bitmap.width, height / bitmap.height);
      const w = bitmap.width * scale;
      const h = bitmap.height * scale;
      context.clearRect(0, 0, width, height);
      context.drawImage(bitmap, (width - w) / 2, (height - h) / 2, w, h);
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [bitmap]);

  return (
    <div className={styles.view}>
      <canvas
        ref={canvas}
        className={styles.canvas}
        role="img"
        aria-label={`Graph image: ${graph.name}, ${String(graph.image.width)} × ${String(graph.image.height)} px`}
        data-state={state.status}
      />
      {state.status === 'loading' && (
        <div className={styles.status}>
          <Spinner label="Loading image…" />
        </div>
      )}
      {state.status === 'error' && (
        <div className={styles.status}>
          <Caption1 role="alert">Could not show this image: {state.message}</Caption1>
        </div>
      )}
    </div>
  );
}
