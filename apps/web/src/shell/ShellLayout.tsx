import { Button, Caption1Strong, makeStyles, tokens } from '@fluentui/react-components';
import { ChevronDownRegular, ChevronUpRegular } from '@fluentui/react-icons';
import { type ReactNode, useId, useState } from 'react';
import { SIDEBAR_ID } from './AppHeader';

// PRD §4.11 / ADR 9: sidebar → tool rail → canvas → inspector, with a collapsible bottom dock.
const useStyles = makeStyles({
  body: {
    display: 'flex',
    flexGrow: 1,
    minHeight: 0,
  },
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    width: '240px',
    flexShrink: 0,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRight: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  work: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: 0,
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
    overflow: 'auto',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  inspector: {
    display: 'flex',
    flexDirection: 'column',
    width: '280px',
    flexShrink: 0,
    backgroundColor: tokens.colorNeutralBackground2,
    borderLeft: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  dock: {
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    backgroundColor: tokens.colorNeutralBackground2,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  dockBody: {
    height: '200px',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: '32px',
    paddingInline: tokens.spacingHorizontalM,
  },
});

export interface ShellLayoutProps {
  readonly sidebarOpen: boolean;
  readonly sidebar?: ReactNode;
  readonly canvas?: ReactNode;
  readonly inspector?: ReactNode;
  readonly dock?: ReactNode;
}

export function ShellLayout({ sidebarOpen, sidebar, canvas, inspector, dock }: ShellLayoutProps) {
  const styles = useStyles();
  const [dockOpen, setDockOpen] = useState(true);
  const dockBodyId = useId();

  return (
    <div className={styles.body}>
      {sidebarOpen && (
        <aside id={SIDEBAR_ID} aria-label="Project and pages" className={styles.sidebar}>
          <div className={styles.panelHeader}>
            <Caption1Strong>Project</Caption1Strong>
          </div>
          {sidebar}
        </aside>
      )}
      <div className={styles.work}>
        <div className={styles.row}>
          <div role="region" aria-label="Tools" className={styles.rail} />
          <main aria-label="Canvas" className={styles.canvas}>
            {canvas}
          </main>
          <aside aria-label="Inspector" className={styles.inspector}>
            <div className={styles.panelHeader}>
              <Caption1Strong>Inspector</Caption1Strong>
            </div>
            {inspector}
          </aside>
        </div>
        <section aria-label="Data dock" className={styles.dock}>
          <div className={styles.panelHeader}>
            <Caption1Strong>Data</Caption1Strong>
            <Button
              appearance="subtle"
              size="small"
              icon={dockOpen ? <ChevronDownRegular /> : <ChevronUpRegular />}
              aria-label="Data dock"
              aria-expanded={dockOpen}
              aria-controls={dockBodyId}
              onClick={() => {
                setDockOpen((open) => !open);
              }}
            />
          </div>
          {dockOpen && (
            <div id={dockBodyId} className={styles.dockBody}>
              {dock}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
