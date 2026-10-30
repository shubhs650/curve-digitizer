import { webDarkTheme, webLightTheme } from '@fluentui/react-components';
import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, otherTheme, themes } from './theme';

describe('theme tokens', () => {
  it('defaults to light', () => {
    expect(DEFAULT_THEME).toBe('light');
  });

  it('maps light and dark to the Fluent 2 web themes', () => {
    expect(themes.light).toBe(webLightTheme);
    expect(themes.dark).toBe(webDarkTheme);
  });

  it('toggles between the two', () => {
    expect(otherTheme('light')).toBe('dark');
    expect(otherTheme('dark')).toBe('light');
  });
});
