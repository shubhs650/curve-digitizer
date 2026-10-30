import type { OverlayPoint } from './overlay';
import type { Vec2 } from './viewTransform';

/** A pointer event on the canvas, already mapped into image px and hit-tested. */
export interface CanvasPointer {
  /** Image px (ADR 25 convention). */
  readonly image: Vec2;
  /** CSS px from the canvas's top-left corner. */
  readonly screen: Vec2;
  /** The overlay point under the pointer, if any. */
  readonly hit: OverlayPoint | null;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
}

/**
 * What the active tool does with primary-button input on the canvas. Panning (pan tool, middle button,
 * Space + drag), zoom and the loupe are handled by the canvas for every tool.
 */
export interface ToolHandlers {
  readonly cursor: string;
  /** Return true to take the drag: subsequent moves and the release go to this tool. */
  readonly onDown?: (pointer: CanvasPointer) => boolean;
  readonly onDrag?: (pointer: CanvasPointer) => void;
  readonly onUp?: (pointer: CanvasPointer) => void;
  /** Return true when the key was handled, so the canvas skips its own binding. */
  readonly onKeyDown?: (event: KeyboardEvent) => boolean;
}

export const SELECT_TOOL: ToolHandlers = { cursor: 'default' };
