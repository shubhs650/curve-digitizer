import { Button, makeStyles, mergeClasses, Subtitle2, tokens } from '@fluentui/react-components';
import { ChevronDownRegular, ChevronUpRegular } from '@fluentui/react-icons';
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { useZoomCapture } from '../canvas/zoomTarget';
import { SIDEBAR_ID } from './AppHeader';
import { clampDockHeight, dockPreference, type DockPrefs, DOCK_MIN } from './layoutPrefs';

/** Height of a panel's title row, CSS px. */
const HEADER_HEIGHT = 40;
/** Splitter keyboard step, CSS px. */
const SPLIT_STEP = 16;

// PRD §4.11 / ADR 9: sidebar → tool rail → canvas → inspector, with a collapsible bottom dock. The dock sits
// under the rail and canvas only, so the inspector keeps the full height. A region is shown only while it has
// content, so the canvas gets the room (ADR 47).
const useStyles = makeStyles({
  body: {
    display: 'flex',
    flexGrow: 1,
    minHeight: 0,
  },
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    width: '248px',
    flexShrink: 0,
    minHeight: 0,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRight: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  center: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: 0,
    minHeight: 0,
  },
  row: {
    display: 'flex',
    flexGrow: 1,
    minHeight: 0,
  },
  rail: {
    width: '48px',
    flexShrink: 0,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRight: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  canvas: {
    position: 'relative',
    flexGrow: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'auto',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  inspector: {
    display: 'flex',
    flexDirection: 'column',
    width: '288px',
    flexShrink: 0,
    minHeight: 0,
    backgroundColor: tokens.colorNeutralBackground2,
    borderLeft: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  dock: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    backgroundColor: tokens.colorNeutralBackground2,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  dockBody: {
    minHeight: 0,
    overflow: 'hidden',
  },
  splitter: {
    position: 'absolute',
    top: '-4px',
    left: 0,
    right: 0,
    height: '8px',
    zIndex: 1,
    cursor: 'row-resize',
    touchAction: 'none',
    ':hover': {
      backgroundColor: tokens.colorBrandBackground2,
    },
    ':focus-visible': {
      outline: `${tokens.strokeWidthThick} solid ${tokens.colorStrokeFocus2}`,
      outlineOffset: `calc(-1 * ${tokens.strokeWidthThick})`,
    },
  },
  splitting: {
    backgroundColor: tokens.colorBrandBackground2,
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
    height: `${String(HEADER_HEIGHT)}px`,
    boxSizing: 'border-box',
    paddingInline: tokens.spacingHorizontalM,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke3}`,
  },
  dockHeaderClosed: {
    borderBottom: 'none',
  },
});

export interface ShellLayoutProps {
  readonly sidebarOpen: boolean;
  readonly sidebar?: ReactNode;
  /** Each of these regions is left out while it is null, undefined or false. */
  readonly rail?: ReactNode;
  readonly canvas?: ReactNode;
  readonly inspector?: ReactNode;
  readonly dock?: ReactNode;
}

const shown = (node: ReactNode): boolean => node !== undefined && node !== null && node !== false;

export function ShellLayout({ sidebarOpen, sidebar, rail, canvas, inspector, dock }: ShellLayoutProps) {
  const styles = useStyles();
  const main = useRef<HTMLElement>(null);
  useZoomCapture(main);

  return (
    <div className={styles.body}>
      {sidebarOpen && shown(sidebar) && (
        <aside id={SIDEBAR_ID} aria-label="Project and pages" className={styles.sidebar}>
          {sidebar}
        </aside>
      )}
      <div className={styles.center}>
        <div className={styles.row}>
          {shown(rail) && (
            <div role="region" aria-label="Tools" className={styles.rail}>
              {rail}
            </div>
          )}
          <main ref={main} aria-label="Canvas" className={styles.canvas}>
            {canvas}
          </main>
        </div>
        {shown(dock) && <Dock>{dock}</Dock>}
      </div>
      {shown(inspector) && (
        <aside aria-label="Inspector" className={styles.inspector}>
          <div className={styles.panelHeader}>
            <Subtitle2 as="h2">Inspector</Subtitle2>
          </div>
          {inspector}
        </aside>
      )}
    </div>
  );
}

/** The bottom dock: collapsible, and resizable by dragging its top edge or with the arrow keys on it. */
function Dock({ children }: { readonly children: ReactNode }) {
  const styles = useStyles();
  const bodyId = useId();
  const section = useRef<HTMLElement>(null);
  const [prefs, setPrefs] = useState<DockPrefs>(() => dockPreference.load(window.innerHeight));
  const [splitting, setSplitting] = useState<{
    pointerId: number;
    startY: number;
    startHeight: number;
  } | null>(null);

  useEffect(() => {
    dockPreference.save(prefs);
  }, [prefs]);

  /** The column the dock shares with the canvas; the canvas above keeps its minimum height. */
  const clamp = (height: number): number => {
    // Without layout (before the first paint) the window height stands in for the column.
    const column = section.current?.parentElement?.clientHeight || window.innerHeight;
    return clampDockHeight(height, column, HEADER_HEIGHT);
  };
  const resize = (height: number) => {
    setPrefs({ open: true, height: clamp(height) });
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setSplitting({
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: prefs.open ? prefs.height : 0,
    });
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (splitting?.pointerId !== event.pointerId) return;
    const height = splitting.startHeight + (splitting.startY - event.clientY);
    if (height < DOCK_MIN / 2) setPrefs((p) => ({ ...p, open: false }));
    else resize(height);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = prefs.open ? prefs.height : DOCK_MIN;
    if (event.key === 'ArrowUp') resize(current + SPLIT_STEP);
    else if (event.key === 'ArrowDown') resize(current - SPLIT_STEP);
    else if (event.key === 'Enter') setPrefs((p) => ({ ...p, open: !p.open }));
    else return;
    event.preventDefault();
  };

  const height = clamp(prefs.height);
  const max = clamp(Number.MAX_SAFE_INTEGER);
  return (
    <section ref={section} aria-label="Data dock" className={styles.dock}>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the data dock"
        aria-controls={prefs.open ? bodyId : undefined}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={prefs.open ? height : 0}
        tabIndex={0}
        className={mergeClasses(styles.splitter, splitting !== null && styles.splitting)}
        data-testid="dock-splitter"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          setSplitting(null);
        }}
        onPointerCancel={() => {
          setSplitting(null);
        }}
        onKeyDown={onKeyDown}
      />
      <div className={mergeClasses(styles.panelHeader, !prefs.open && styles.dockHeaderClosed)}>
        <Subtitle2 as="h2">Data</Subtitle2>
        <Button
          appearance="subtle"
          size="small"
          icon={prefs.open ? <ChevronDownRegular /> : <ChevronUpRegular />}
          aria-label="Data dock"
          aria-expanded={prefs.open}
          aria-controls={prefs.open ? bodyId : undefined}
          onClick={() => {
            setPrefs((p) => ({ ...p, open: !p.open }));
          }}
        />
      </div>
      {prefs.open && (
        <div id={bodyId} className={styles.dockBody} style={{ height: `${String(height)}px` }}>
          {children}
        </div>
      )}
    </section>
  );
}
