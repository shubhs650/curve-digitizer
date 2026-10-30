import { makeStyles, ToggleButton, Tooltip, tokens } from '@fluentui/react-components';
import { CursorRegular, HandRightRegular, ZoomFitRegular } from '@fluentui/react-icons';
import type { ReactElement } from 'react';
import { UndoButtons } from '../history/UndoButtons';
import { type ToolId, useUiStore } from '../ui/uiStore';

const useStyles = makeStyles({
  rail: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalXS,
    height: '100%',
    boxSizing: 'border-box',
    paddingBlock: tokens.spacingVerticalS,
  },
  spacer: {
    flexGrow: 1,
  },
});

interface RailTool {
  readonly id: ToolId;
  readonly label: string;
  readonly shortcut: string;
  readonly icon: ReactElement;
}

/** Tools in rail order; their single-key shortcuts are handled by useToolShortcuts. */
export const RAIL_TOOLS: readonly RailTool[] = [
  { id: 'select', label: 'Select', shortcut: 'V', icon: <CursorRegular /> },
  { id: 'pan', label: 'Pan', shortcut: 'H', icon: <HandRightRegular /> },
];

export function ToolRail() {
  const styles = useStyles();
  const tool = useUiStore((s) => s.tool);
  const setTool = useUiStore((s) => s.setTool);
  const loupe = useUiStore((s) => s.loupe);
  const toggleLoupe = useUiStore((s) => s.toggleLoupe);

  // A plain toolbar of buttons: Fluent's Toolbar makes Tabster add focusable aria-hidden sentinels that axe flags.
  return (
    <div role="toolbar" aria-label="Canvas tools" aria-orientation="vertical" className={styles.rail}>
      {RAIL_TOOLS.map((t) => (
        <Tooltip
          key={t.id}
          content={`${t.label} (${t.shortcut})`}
          relationship="description"
          positioning="after"
        >
          <ToggleButton
            appearance="subtle"
            checked={tool === t.id}
            icon={t.icon}
            aria-label={t.label}
            aria-keyshortcuts={t.shortcut}
            onClick={() => {
              setTool(t.id);
            }}
          />
        </Tooltip>
      ))}
      <Tooltip content="Loupe (L)" relationship="description" positioning="after">
        <ToggleButton
          appearance="subtle"
          checked={loupe}
          icon={<ZoomFitRegular />}
          aria-label="Loupe"
          aria-keyshortcuts="L"
          onClick={toggleLoupe}
        />
      </Tooltip>
      <div className={styles.spacer} />
      <UndoButtons />
    </div>
  );
}
