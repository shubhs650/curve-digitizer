// Every keyboard shortcut of the app, in one list: the cheat sheet (`?`) and the docs page are built from it,
// and a test checks the docs page against it (U2). Keys are written as shown to the user.

export interface Shortcut {
  /** One or more alternative key combinations, e.g. ["Ctrl+Y", "Ctrl+Shift+Z"]. */
  readonly keys: readonly string[];
  readonly action: string;
}

export interface ShortcutGroup {
  readonly title: string;
  /** Where the keys work, when not everywhere. */
  readonly where?: string;
  readonly shortcuts: readonly Shortcut[];
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Anywhere',
    shortcuts: [
      { keys: ['?'], action: 'Show these shortcuts' },
      { keys: ['Ctrl+Z'], action: 'Undo' },
      { keys: ['Ctrl+Y', 'Ctrl+Shift+Z'], action: 'Redo' },
      { keys: ['Ctrl+S'], action: 'Save the project as a .cdz file' },
      { keys: ['Ctrl+V'], action: 'Paste an image as a new graph' },
      { keys: ['Tab', 'Shift+Tab'], action: 'Move between controls' },
    ],
  },
  {
    title: 'Tools',
    where: 'when not typing in a field',
    shortcuts: [
      { keys: ['V'], action: 'Select tool' },
      { keys: ['P'], action: 'Add points tool' },
      { keys: ['H'], action: 'Pan tool' },
      { keys: ['C'], action: 'Calibrate tool' },
      { keys: ['L'], action: 'Loupe on or off' },
      { keys: ['S'], action: 'Magnetic snap on or off' },
    ],
  },
  {
    title: 'Graph canvas',
    where: 'with the canvas focused',
    shortcuts: [
      { keys: ['+', '−'], action: 'Zoom in or out (also the mouse wheel)' },
      { keys: ['0'], action: 'Fit the image to the window' },
      { keys: ['1'], action: 'Actual size' },
      { keys: ['Arrow keys'], action: 'Pan (Shift: further), or nudge selected points' },
      { keys: ['Space+drag'], action: 'Pan with the mouse (also the middle button)' },
      { keys: ['Enter'], action: 'Show the keyboard crosshair, then click with the current tool' },
      { keys: ['Arrow keys'], action: 'Move the crosshair 1 px (Shift: 10 px) while it is shown' },
      { keys: ['Esc'], action: 'Hide the crosshair, or clear the selection' },
    ],
  },
  {
    title: 'Points',
    where: 'with the canvas focused',
    shortcuts: [
      { keys: ['Arrow keys'], action: 'Nudge the selected points 1 px' },
      { keys: ['Shift+Arrow keys'], action: 'Nudge the selected points 0.1 px' },
      { keys: ['Delete', 'Backspace'], action: 'Delete the selected points' },
      { keys: ['Ctrl+A'], action: 'Select every point of the graph' },
      { keys: ['Shift+click', 'Ctrl+click'], action: 'Add to or remove from the selection' },
    ],
  },
  {
    title: 'Data table',
    where: 'with a table cell focused',
    shortcuts: [
      { keys: ['Arrow keys', 'Page Up', 'Page Down'], action: 'Move between cells' },
      { keys: ['Home', 'End'], action: 'First or last column (Ctrl: first or last cell)' },
      { keys: ['Enter', 'F2'], action: 'Edit the cell (or type a number)' },
      { keys: ['Enter', 'Tab'], action: 'Keep the edit and move down or right' },
      { keys: ['Esc'], action: 'Cancel the edit' },
      { keys: ['Space'], action: 'Select the row, or toggle Excluded' },
      { keys: ['Ctrl+C'], action: 'Copy the selected rows, or the whole table' },
    ],
  },
];
