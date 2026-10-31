import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useEffect } from 'react';
import { isEditableTarget } from '../input/files';
import { useUiStore } from '../ui/uiStore';
import { SHORTCUT_GROUPS } from './shortcuts';

const useStyles = makeStyles({
  surface: {
    maxWidth: '760px',
  },
  groups: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: tokens.spacingHorizontalXL,
  },
  table: {
    borderCollapse: 'collapse',
    width: '100%',
  },
  caption: {
    textAlign: 'left',
    fontWeight: tokens.fontWeightSemibold,
    paddingBottom: tokens.spacingVerticalXS,
  },
  where: {
    fontWeight: tokens.fontWeightRegular,
    color: tokens.colorNeutralForeground3,
  },
  keys: {
    whiteSpace: 'nowrap',
    verticalAlign: 'top',
    paddingRight: tokens.spacingHorizontalM,
    paddingBlock: tokens.spacingVerticalXXS,
    textAlign: 'left',
    fontWeight: tokens.fontWeightRegular,
  },
  kbd: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
    padding: `0 ${tokens.spacingHorizontalXS}`,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  action: {
    paddingBlock: tokens.spacingVerticalXXS,
  },
});

/** Opens the cheat sheet on `?` unless the user is typing. */
export function useShortcutSheetKey(): void {
  const setOpen = useUiStore((s) => s.setShortcutsOpen);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.defaultPrevented || isEditableTarget(event.target)) return;
      event.preventDefault();
      setOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [setOpen]);
}

/** Every keyboard shortcut (PRD §4.11, U2), from the same list as the docs page. */
export function ShortcutSheet() {
  const styles = useStyles();
  const open = useUiStore((s) => s.shortcutsOpen);
  const setOpen = useUiStore((s) => s.setShortcutsOpen);
  // Mounted only while open: a closed Fluent dialog still leaves focus sentinels that axe flags.
  if (!open) return null;
  return (
    <Dialog
      open
      onOpenChange={(_, data) => {
        setOpen(data.open);
      }}
    >
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          {/* Focusable so the list scrolls from the keyboard: it holds no controls of its own. */}
          <DialogContent tabIndex={0} aria-label="Shortcut list">
            <div className={styles.groups}>
              {SHORTCUT_GROUPS.map((group) => (
                <table key={group.title} className={styles.table}>
                  <caption className={styles.caption}>
                    {group.title}
                    {group.where && <span className={styles.where}> ({group.where})</span>}
                  </caption>
                  <tbody>
                    {group.shortcuts.map((shortcut) => (
                      <tr key={`${shortcut.keys.join()}-${shortcut.action}`}>
                        <th scope="row" className={styles.keys}>
                          {shortcut.keys.map((k, i) => (
                            <span key={k}>
                              {i > 0 && ' or '}
                              <kbd className={styles.kbd}>{k}</kbd>
                            </span>
                          ))}
                        </th>
                        <td className={styles.action}>{shortcut.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </div>
          </DialogContent>
          <DialogActions>
            <Button
              appearance="primary"
              onClick={() => {
                setOpen(false);
              }}
            >
              Close
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
