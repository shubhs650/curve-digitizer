import { Body1, makeStyles, tokens } from '@fluentui/react-components';
import { OpenImageButton } from '../input/OpenImageButton';

const useStyles = makeStyles({
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalM,
    height: '100%',
    padding: tokens.spacingHorizontalXXL,
    textAlign: 'center',
  },
});

/** Canvas content for an open project that has no graph yet. */
export function ProjectEmpty({ onFiles }: { onFiles: (files: File[]) => void }) {
  const styles = useStyles();
  return (
    <div className={styles.empty}>
      <Body1>Add an image of a graph: open it, drop it here, or paste it with Ctrl+V.</Body1>
      <OpenImageButton appearance="primary" onFiles={onFiles} />
    </div>
  );
}
