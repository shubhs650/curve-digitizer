import type { Graph } from '@cd/core';
import { useCallback } from 'react';
import { paintCalibration } from '../calibration/overlay';
import { useCalibrateTool } from '../calibration/useCalibrateTool';
import { useCalibrationEditor } from '../calibration/useCalibrationEditor';
import { GraphCanvas } from '../canvas/GraphCanvas';
import type { ViewTransform } from '../canvas/viewTransform';
import { useUiStore } from '../ui/uiStore';

/** The canvas with the rail's active tool plugged in. */
export function GraphEditor({ graph }: { graph: Graph }) {
  const tool = useUiStore((s) => s.tool);
  const editor = useCalibrationEditor(graph);
  const calibrate = useCalibrateTool(editor);
  const { picks } = editor.draft;
  const decorateCalibration = useCallback(
    (ctx: CanvasRenderingContext2D, view: ViewTransform) => {
      paintCalibration(ctx, view, graph.image, picks, graph.calibration);
    },
    [graph.image, graph.calibration, picks],
  );

  if (tool === 'calibrate')
    return <GraphCanvas graph={graph} tool={calibrate} decorate={decorateCalibration} />;
  return <GraphCanvas graph={graph} />;
}
