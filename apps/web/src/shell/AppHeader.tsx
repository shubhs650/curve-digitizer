import { Button, Text, ToggleButton, Tooltip, makeStyles, tokens } from '@fluentui/react-components';
import {
  BookOpenRegular,
  BugRegular,
  CodeRegular,
  HomeRegular,
  KeyboardRegular,
  PanelLeftContractRegular,
  PanelLeftExpandRegular,
  WeatherMoonRegular,
} from '@fluentui/react-icons';
import { DOCS_PATH, OET_HOME_URL, REPO_URL, reportIssueUrl } from '../links';
import type { ThemeName } from '../theme';
import { OfflineBadge } from '../pwa/OfflineBadge';
import { useOfflineReadiness } from '../pwa/offlineReadiness';
import { useUiStore } from '../ui/uiStore';
import { APP_VERSION } from '../version';

export const SIDEBAR_ID = 'project-sidebar';

/** Below this width the header's text buttons show their icons only (their names stay as aria-labels). */
const COMPACT = '@media (max-width: 1099px)';

const useStyles = makeStyles({
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexShrink: 0,
    height: '48px',
    paddingInline: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
    flexGrow: 1,
  },
  mark: {
    width: '24px',
    height: '24px',
    flexShrink: 0,
  },
  title: {
    whiteSpace: 'nowrap',
  },
  separator: {
    color: tokens.colorNeutralForeground4,
    [COMPACT]: { display: 'none' },
  },
  project: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: tokens.colorNeutralForeground2,
    [COMPACT]: { display: 'none' },
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
  },
  label: {
    [COMPACT]: { display: 'none' },
  },
  // Fluent gives text buttons a 96 px minimum width; with the label hidden they are icon buttons.
  textButton: {
    [COMPACT]: { minWidth: 'auto', paddingInline: tokens.spacingHorizontalSNudge },
  },
  badge: {
    [COMPACT]: { display: 'none' },
  },
});

const offSite = { target: '_blank', rel: 'noopener noreferrer' } as const;

export interface AppHeaderProps {
  readonly theme: ThemeName;
  readonly onToggleTheme: () => void;
  readonly sidebarOpen: boolean;
  readonly onToggleSidebar: () => void;
  /** The open project's name; the sidebar toggle shows only while a project is open. */
  readonly projectName: string | null;
}

export function AppHeader({
  theme,
  onToggleTheme,
  sidebarOpen,
  onToggleSidebar,
  projectName,
}: AppHeaderProps) {
  const styles = useStyles();
  const issueUrl = reportIssueUrl({ version: APP_VERSION, userAgent: navigator.userAgent });
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);
  const offline = useOfflineReadiness();

  return (
    <header className={styles.header}>
      {projectName !== null && (
        <Tooltip
          content={sidebarOpen ? 'Hide project sidebar' : 'Show project sidebar'}
          relationship="description"
        >
          <Button
            appearance="subtle"
            icon={sidebarOpen ? <PanelLeftContractRegular /> : <PanelLeftExpandRegular />}
            aria-label="Project sidebar"
            aria-expanded={sidebarOpen}
            aria-controls={sidebarOpen ? SIDEBAR_ID : undefined}
            onClick={onToggleSidebar}
          />
        </Tooltip>
      )}
      <div className={styles.brand}>
        <img src="/icon.svg" alt="" width={24} height={24} className={styles.mark} />
        <Text as="h1" size={400} weight="semibold" className={styles.title}>
          Curve Digitizer
        </Text>
        {projectName !== null && (
          <>
            <Text aria-hidden="true" className={styles.separator}>
              /
            </Text>
            <Text className={styles.project} title={projectName} data-testid="header-project">
              {projectName}
            </Text>
          </>
        )}
      </div>
      <nav aria-label="Site" className={styles.nav}>
        <Tooltip content="Open Engineering Tools" relationship="description">
          <Button
            as="a"
            href={OET_HOME_URL}
            {...offSite}
            appearance="subtle"
            icon={<HomeRegular />}
            aria-label="Open Engineering Tools home"
          />
        </Tooltip>
        <Button
          appearance="subtle"
          icon={<KeyboardRegular />}
          aria-label="Shortcuts"
          className={styles.textButton}
          aria-keyshortcuts="?"
          onClick={() => {
            setShortcutsOpen(true);
          }}
        >
          <span className={styles.label}>Shortcuts</span>
        </Button>
        <Button
          as="a"
          href={DOCS_PATH}
          appearance="subtle"
          icon={<BookOpenRegular />}
          aria-label="Docs"
          className={styles.textButton}
        >
          <span className={styles.label}>Docs</span>
        </Button>
        <Button
          as="a"
          href={issueUrl}
          {...offSite}
          appearance="subtle"
          icon={<BugRegular />}
          aria-label="Report issue"
          className={styles.textButton}
        >
          <span className={styles.label}>Report issue</span>
        </Button>
        <Tooltip content="Source code on GitHub" relationship="description">
          <Button
            as="a"
            href={REPO_URL}
            {...offSite}
            appearance="subtle"
            icon={<CodeRegular />}
            aria-label="GitHub repository"
          />
        </Tooltip>
      </nav>
      <span className={styles.badge}>
        <OfflineBadge readiness={offline} />
      </span>
      <ToggleButton
        appearance="subtle"
        icon={<WeatherMoonRegular />}
        aria-label="Dark theme"
        checked={theme === 'dark'}
        onClick={onToggleTheme}
      />
    </header>
  );
}
