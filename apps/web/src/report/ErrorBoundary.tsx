import { Body1, Button, makeStyles, Subtitle1, tokens } from '@fluentui/react-components';
import { BugRegular } from '@fluentui/react-icons';
import { Component, type ReactNode } from 'react';
import { useReportStore } from './reportStore';

const useStyles = makeStyles({
  fallback: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalXXL,
    maxWidth: '640px',
  },
  row: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
  },
});

function CrashScreen({ error }: { readonly error: unknown }) {
  const styles = useStyles();
  const open = useReportStore((s) => s.open);
  return (
    <main className={styles.fallback} role="alert">
      <Subtitle1>Something went wrong</Subtitle1>
      <Body1>
        Curve Digitizer hit an error it could not recover from. Your project is saved on this device up to the
        last autosave; reloading reopens it.
      </Body1>
      <div className={styles.row}>
        <Button
          appearance="primary"
          onClick={() => {
            location.reload();
          }}
        >
          Reload
        </Button>
        <Button
          icon={<BugRegular />}
          onClick={() => {
            open({ error, title: 'Crash' });
          }}
        >
          Report this error…
        </Button>
      </div>
    </main>
  );
}

/** Catches a render crash (ARCHITECTURE §11): shows a way out and offers the report dialog, sending nothing. */
export class ErrorBoundary extends Component<{ readonly children: ReactNode }, { readonly error: unknown }> {
  override state: { readonly error: unknown } = { error: null };

  static getDerivedStateFromError(error: unknown): { error: unknown } {
    // `null` means "no error"; anything else, even a thrown `undefined`, is a crash.
    return { error: error ?? new Error('Unknown error') };
  }

  override componentDidCatch(error: unknown): void {
    useReportStore.getState().open({ error, title: 'Crash' });
  }

  override render(): ReactNode {
    return this.state.error === null ? this.props.children : <CrashScreen error={this.state.error} />;
  }
}
