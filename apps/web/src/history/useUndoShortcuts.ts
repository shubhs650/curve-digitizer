import { useEffect } from 'react';
import { isEditableTarget } from '../input/files';
import { useWorkspaceState } from '../session/context';

/**
 * Ctrl+Z undo, Ctrl+Y / Ctrl+Shift+Z redo (⌘ on macOS) for project changes. Inside a text field the browser's
 * own text undo wins, so typing is never undone a whole field at a time by surprise.
 */
export function useUndoShortcuts(): void {
  const { store } = useWorkspaceState();
  useEffect(() => {
    if (!store) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) store.undo();
      else if (key === 'y' || (key === 'z' && event.shiftKey)) store.redo();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [store]);
}
