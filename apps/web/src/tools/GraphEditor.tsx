import type { Graph } from '@cd/core';
import { useCallback, useMemo } from 'react';
import { paintCalibration } from '../calibration/overlay';
import { useCalibrateTool } from '../calibration/useCalibrateTool';
import { useCalibrationEditor } from '../calibration/useCalibrationEditor';
import { GraphCanvas } from '../canvas/GraphCanvas';
import { type BitmapState, useGraphBitmap } from '../canvas/useGraphBitmap';
import type { ViewTransform } from '../canvas/viewTransform';
import { bitmapPixels } from '../points/pixels';
import { useMaskTool } from '../mask/useMaskTool';
import { paintMarquee, usePointTools } from '../points/usePointTools';
import { useProcessedImage } from '../processing/processedImage';
import { useTraceTool } from '../trace/useTraceTool';
import { useUiStore } from '../ui/uiStore';

/** The canvas with the rail's active tool plugged in. */
export function GraphEditor({ graph }: { graph: Graph }) {
  const tool = useUiStore((s) => s.tool);
  const selection = useUiStore((s) => s.selection);
  const original = useGraphBitmap(graph);
  const bitmap = original.status === 'ready' ? original.bitmap : null;
  const showProcessed = useUiStore((s) => s.showProcessed);
  const processed = useProcessedImage(graph, showProcessed);
  // The preview swaps only what is drawn; snapping and every other tool keep reading the original pixels.
  const bitmapState: BitmapState =
    showProcessed && processed.status === 'ready' ? { status: 'ready', bitmap: processed.bitmap } : original;
  const pixels = useMemo(() => (bitmap ? bitmapPixels(bitmap) : null), [bitmap]);
  const points = usePointTools(graph, pixels);
  const editor = useCalibrationEditor(graph);
  const calibrate = useCalibrateTool(editor);
  const mask = useMaskTool(graph);
  const trace = useTraceTool(graph);
  const { picks } = editor.draft;
  const { marquee } = points;
  const decorateCalibration = useCallback(
    (ctx: CanvasRenderingContext2D, view: ViewTransform) => {
      paintCalibration(ctx, view, graph.image, picks, graph.calibration);
    },
    [graph.image, graph.calibration, picks],
  );
  const decorateMarquee = useCallback(
    (ctx: CanvasRenderingContext2D, view: ViewTransform) => {
      if (marquee) paintMarquee(ctx, view, marquee);
    },
    [marquee],
  );

  const common = { graph, bitmapState, selection };
  switch (tool) {
    case 'calibrate':
      return <GraphCanvas {...common} tool={calibrate} decorate={decorateCalibration} />;
    case 'point':
      return <GraphCanvas {...common} tool={points.point} />;
    case 'select':
      return <GraphCanvas {...common} tool={points.select} decorate={decorateMarquee} />;
    case 'pan':
      return <GraphCanvas {...common} />;
    case 'trace':
      return <GraphCanvas {...common} tool={trace.tool} decorate={trace.decorate} />;
    case 'mask':
      return <GraphCanvas {...common} tool={mask.tool} decorate={mask.decorate} />;
  }
}
