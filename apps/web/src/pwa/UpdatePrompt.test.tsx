import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { UpdatePrompt } from './UpdatePrompt';

// Fluent's MessageBar measures itself with ResizeObserver, which jsdom does not implement.
beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

afterEach(cleanup);

function renderPrompt(open: boolean) {
  const onReload = vi.fn();
  const onDismiss = vi.fn();
  render(
    <FluentProvider theme={webLightTheme}>
      <UpdatePrompt open={open} onReload={onReload} onDismiss={onDismiss} />
    </FluentProvider>,
  );
  return { onReload, onDismiss, user: userEvent.setup() };
}

describe('UpdatePrompt', () => {
  it('renders nothing while there is no new version', () => {
    renderPrompt(false);
    expect(screen.queryByText(/New version available/)).toBeNull();
  });

  it('announces the new version with labelled Reload and Dismiss buttons', () => {
    renderPrompt(true);
    expect(screen.getByText(/New version available/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('reloads or dismisses on request', async () => {
    const { onReload, onDismiss, user } = renderPrompt(true);
    await user.click(screen.getByRole('button', { name: 'Reload' }));
    expect(onReload).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
