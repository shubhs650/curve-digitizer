import { FluentProvider, makeStyles } from '@fluentui/react-components';
import { useState } from 'react';
import { AppHeader } from './shell/AppHeader';
import { ShellLayout } from './shell/ShellLayout';
import { DEFAULT_THEME, otherTheme, themes } from './theme';
import type { ThemeName } from './theme';

// Layout lives on an inner element: FluentProvider copies its own className onto tooltip/dialog portal
// nodes, so a full-height style there would make every portal cover the page.
const useStyles = makeStyles({
  shell: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
  },
});

export function App() {
  const styles = useStyles();
  const [theme, setTheme] = useState<ThemeName>(DEFAULT_THEME);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <FluentProvider theme={themes[theme]} data-theme={theme}>
      <div className={styles.shell}>
        <AppHeader
          theme={theme}
          onToggleTheme={() => {
            setTheme(otherTheme);
          }}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => {
            setSidebarOpen((open) => !open);
          }}
        />
        <ShellLayout sidebarOpen={sidebarOpen} />
      </div>
    </FluentProvider>
  );
}
