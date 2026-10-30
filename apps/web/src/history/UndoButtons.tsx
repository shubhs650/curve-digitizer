import { Button, Tooltip } from '@fluentui/react-components';
import { ArrowRedoRegular, ArrowUndoRegular } from '@fluentui/react-icons';
import { useProject, useWorkspaceState } from '../session/context';

/** Undo/redo for the open project, labelled with what they will undo or redo. */
export function UndoButtons() {
  const { store } = useWorkspaceState();
  // Re-render on every project change so the labels and disabled states follow the history.
  useProject();
  if (!store) return null;
  const undo = store.undoLabel;
  const redo = store.redoLabel;
  return (
    <>
      <Tooltip
        content={undo ? `Undo ${undo} (Ctrl+Z)` : 'Nothing to undo'}
        relationship="description"
        positioning="after"
      >
        <Button
          appearance="subtle"
          icon={<ArrowUndoRegular />}
          aria-label="Undo"
          aria-keyshortcuts="Control+Z"
          disabledFocusable={!store.canUndo}
          onClick={() => store.undo()}
        />
      </Tooltip>
      <Tooltip
        content={redo ? `Redo ${redo} (Ctrl+Y)` : 'Nothing to redo'}
        relationship="description"
        positioning="after"
      >
        <Button
          appearance="subtle"
          icon={<ArrowRedoRegular />}
          aria-label="Redo"
          aria-keyshortcuts="Control+Y"
          disabledFocusable={!store.canRedo}
          onClick={() => store.redo()}
        />
      </Tooltip>
    </>
  );
}
