import { useEffect } from 'react';
import { isEditableTarget } from '../input/files';
import { useUiStore } from '../ui/uiStore';
import { RAIL_TOOLS } from './ToolRail';

/** Single-key tool shortcuts (V, H, L), ignored while typing in a field or with a modifier held. */
export function useToolShortcuts(): void {
  const setTool = useUiStore((s) => s.setTool);
  const toggleLoupe = useUiStore((s) => s.toggleLoupe);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      const key = event.key.toUpperCase();
      const tool = RAIL_TOOLS.find((t) => t.shortcut === key);
      if (tool) setTool(tool.id);
      else if (key === 'L') toggleLoupe();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [setTool, toggleLoupe]);
}
