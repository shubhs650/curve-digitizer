import {
  Button,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  MessageBarTitle,
  makeStyles,
} from '@fluentui/react-components';
import { DismissRegular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  bar: {
    flexShrink: 0,
    borderRadius: 0,
  },
});

export interface UpdatePromptProps {
  readonly open: boolean;
  readonly onReload: () => void;
  readonly onDismiss: () => void;
}

// ARCHITECTURE §10: "New version available — reload". Never reloads by itself, so unsaved work is the
// user's call.
export function UpdatePrompt({ open, onReload, onDismiss }: UpdatePromptProps) {
  const styles = useStyles();
  if (!open) return null;

  return (
    <MessageBar intent="info" politeness="polite" className={styles.bar}>
      <MessageBarBody>
        <MessageBarTitle>New version available</MessageBarTitle>
        Reload to update.
      </MessageBarBody>
      <MessageBarActions
        containerAction={
          <Button
            appearance="transparent"
            icon={<DismissRegular />}
            aria-label="Dismiss"
            onClick={onDismiss}
          />
        }
      >
        <Button onClick={onReload}>Reload</Button>
      </MessageBarActions>
    </MessageBar>
  );
}
