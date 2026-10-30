import type { Vec2 } from '@cd/core';
import { useId, useMemo, useRef } from 'react';
import type { CanvasPointer, ToolHandlers } from '../canvas/tools';
import type { PickIndex } from './draft';
import { nearestPick, PICK_HIT_RADIUS } from './overlay';
import type { CalibrationEditor } from './useCalibrationEditor';

interface PickDrag {
  readonly index: PickIndex;
  /** Pick position minus pointer position at grab, so a marker does not jump to the pointer. */
  readonly offset: Vec2;
  readonly coalesceKey: string;
}

/**
 * The calibrate tool (task 1.3): a click places the active pick, and dragging a placed marker moves it. A placed
 * pick can be dragged straight away to fine-tune it under the loupe; one drag is one undo step.
 */
export function useCalibrateTool(editor: CalibrationEditor): ToolHandlers {
  const id = useId();
  const drags = useRef(0);
  const drag = useRef<PickDrag | null>(null);
  const { draft, active, place } = editor;

  return useMemo<ToolHandlers>(() => {
    const at = (pointer: CanvasPointer, d: PickDrag): Vec2 => [
      pointer.image[0] + d.offset[0],
      pointer.image[1] + d.offset[1],
    ];
    const grab = (index: PickIndex, offset: Vec2): PickDrag => {
      drags.current++;
      return { index, offset, coalesceKey: `${id}#${String(drags.current)}` };
    };
    return {
      cursor: active === null ? 'default' : 'crosshair',
      onDown: (pointer) => {
        const hit = nearestPick(draft.picks, pointer.image, PICK_HIT_RADIUS / pointer.scale);
        if (hit !== null) {
          const px = draft.picks[hit];
          if (px === null) return false;
          drag.current = grab(hit, [px[0] - pointer.image[0], px[1] - pointer.image[1]]);
          return true;
        }
        if (active === null) return false;
        drag.current = grab(active, [0, 0]);
        place(active, pointer.image, drag.current.coalesceKey);
        return true;
      },
      onDrag: (pointer) => {
        const d = drag.current;
        if (d) place(d.index, at(pointer, d), d.coalesceKey);
      },
      onUp: () => {
        drag.current = null;
      },
    };
  }, [id, draft.picks, active, place]);
}
