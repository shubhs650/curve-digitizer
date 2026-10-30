import { webDarkTheme, webLightTheme } from '@fluentui/react-components';
import type { Theme } from '@fluentui/react-components';

export type ThemeName = 'light' | 'dark';

// Fluent 2 web themes are the token set; components read tokens, never raw colours, so both themes stay AA.
export const themes: Readonly<Record<ThemeName, Theme>> = {
  light: webLightTheme,
  dark: webDarkTheme,
};

// PRD §4.11: light by default regardless of the OS preference; dark is opt-in.
export const DEFAULT_THEME: ThemeName = 'light';

export function otherTheme(name: ThemeName): ThemeName {
  return name === 'light' ? 'dark' : 'light';
}
