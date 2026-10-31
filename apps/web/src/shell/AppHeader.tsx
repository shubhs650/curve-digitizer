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

const useStyles = makeStyles({
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexShrink: 0,
    height: '48px',
    paddingInline: tokens.spacingHorizontalS,
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  title: {
    flexGrow: 1,
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
});

const offSite = { target: '_blank', rel: 'noopener noreferrer' } as const;

export interface AppHeaderProps {
  readonly theme: ThemeName;
  readonly onToggleTheme: () => void;
  readonly sidebarOpen: boolean;
  readonly onToggleSidebar: () => void;
}

export function AppHeader({ theme, onToggleTheme, sidebarOpen, onToggleSidebar }: AppHeaderProps) {
  const styles = useStyles();
  const issueUrl = reportIssueUrl({ version: APP_VERSION, userAgent: navigator.userAgent });
  const setShortcutsOpen = useUiStore((s) => s.setShortcutsOpen);
  const offline = useOfflineReadiness();

  return (
    <header className={styles.header}>
      <Tooltip
        content={sidebarOpen ? 'Hide project sidebar' : 'Show project sidebar'}
        relationship="description"
      >
        <Button
          appearance="subtle"
          icon={sidebarOpen ? <PanelLeftContractRegular /> : <PanelLeftExpandRegular />}
          aria-label="Project sidebar"
          aria-expanded={sidebarOpen}
          aria-controls={SIDEBAR_ID}
          onClick={onToggleSidebar}
        />
      </Tooltip>
      <Text as="h1" size={400} weight="semibold" className={styles.title}>
        Curve Digitizer
      </Text>
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
          aria-keyshortcuts="?"
          onClick={() => {
            setShortcutsOpen(true);
          }}
        >
          Shortcuts
        </Button>
        <Button as="a" href={DOCS_PATH} appearance="subtle" icon={<BookOpenRegular />}>
          Docs
        </Button>
        <Button as="a" href={issueUrl} {...offSite} appearance="subtle" icon={<BugRegular />}>
          Report issue
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
      <OfflineBadge readiness={offline} />
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
