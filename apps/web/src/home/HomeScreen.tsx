import {
  Body1,
  Button,
  Caption1,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  makeStyles,
  Text,
  Title2,
  Title3,
  tokens,
} from '@fluentui/react-components';
import { AddRegular, DeleteRegular, FolderOpenRegular, ImageSparkleRegular } from '@fluentui/react-icons';
import { useState } from 'react';
import { OpenFileButton } from '../input/OpenFileButton';
import { useWorkspace, useWorkspaceState } from '../session/context';
import type { ProjectSummary } from '../storage/repository';
import { useNotify } from '../ui/notices';
import { useUiStore } from '../ui/uiStore';
import { DEMOS, openDemo } from './demos';

const useStyles = makeStyles({
  home: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    maxWidth: '720px',
    marginInline: 'auto',
    padding: tokens.spacingHorizontalXXL,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
  },
  list: {
    listStyleType: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  rowText: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: 0,
  },
  demos: {
    listStyleType: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: tokens.spacingHorizontalS,
  },
});

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export interface HomeScreenProps {
  readonly onFiles: (files: File[]) => void;
}

/** The project list (PRD §4.9), shown in the canvas region while no project is open. */
export function HomeScreen({ onFiles }: HomeScreenProps) {
  const styles = useStyles();
  const workspace = useWorkspace();
  const { projects } = useWorkspaceState();
  const notify = useNotify();
  const setActiveGraph = useUiStore((st) => st.setActiveGraph);
  const [toDelete, setToDelete] = useState<ProjectSummary | null>(null);

  const run = (what: string, action: () => Promise<unknown>) => {
    action().catch((error: unknown) => {
      notify({ intent: 'error', title: what, body: error instanceof Error ? error.message : String(error) });
    });
  };

  return (
    <div className={styles.home}>
      <Title2 as="h2">Projects</Title2>
      <Body1>
        Open a PDF or a PNG, JPEG or WebP image of a graph, drop it anywhere on this window, or paste an image
        with Ctrl+V. A saved .cdz project opens the same way. Everything stays on this device.
      </Body1>
      <Caption1>Works best with Chromium browsers (Chrome, Edge).</Caption1>
      <div className={styles.actions}>
        <OpenFileButton appearance="primary" onFiles={onFiles} />
        <Button
          icon={<AddRegular />}
          onClick={() => {
            run('Could not create the project', () => workspace.createProject());
          }}
        >
          New project
        </Button>
      </div>
      {projects.length === 0 ? (
        <Caption1>No saved projects yet.</Caption1>
      ) : (
        <ul aria-label="Saved projects" className={styles.list}>
          {projects.map((p) => (
            <li key={p.id} className={styles.row}>
              <div className={styles.rowText}>
                <Text weight="semibold" truncate wrap={false}>
                  {p.name}
                </Text>
                <Caption1>
                  {dateFormat.format(new Date(p.modified))} ·{' '}
                  {p.graphCount === 1 ? '1 graph' : `${String(p.graphCount)} graphs`}
                </Caption1>
              </div>
              <Button
                icon={<FolderOpenRegular />}
                aria-label={`Open ${p.name}`}
                onClick={() => {
                  run(`Could not open ${p.name}`, () => workspace.openProject(p.id));
                }}
              >
                Open
              </Button>
              <Button
                appearance="subtle"
                icon={<DeleteRegular />}
                aria-label={`Delete ${p.name}`}
                onClick={() => {
                  setToDelete(p);
                }}
              />
            </li>
          ))}
        </ul>
      )}
      <Title3 as="h3">Try a sample</Title3>
      <Caption1>
        Each sample opens as a new, calibrated project with an empty dataset per curve, ready for points or a
        trace.
      </Caption1>
      <ul aria-label="Samples" className={styles.demos}>
        {DEMOS.map((demo) => (
          <li key={demo.sample} className={styles.row}>
            <div className={styles.rowText}>
              <Text weight="semibold">{demo.title}</Text>
              <Caption1>{demo.summary}</Caption1>
            </div>
            <Button
              icon={<ImageSparkleRegular />}
              aria-label={`Open the ${demo.title} sample`}
              onClick={() => {
                run(`Could not open the ${demo.title} sample`, async () => {
                  setActiveGraph(await openDemo(workspace, demo));
                });
              }}
            >
              Open
            </Button>
          </li>
        ))}
      </ul>
      {/* Mounted only while open: a mounted Dialog makes Tabster add focusable sentinels to <body>, which axe flags. */}
      {toDelete !== null && (
        <Dialog
          open
          onOpenChange={(_, data) => {
            if (!data.open) setToDelete(null);
          }}
        >
          <DialogSurface>
            <DialogBody>
              <DialogTitle>Delete “{toDelete.name}”?</DialogTitle>
              <DialogContent>
                The project and its images are removed from this device. This cannot be undone; save a .cdz
                copy first if you may need it.
              </DialogContent>
              <DialogActions>
                <Button
                  appearance="primary"
                  onClick={() => {
                    const target = toDelete;
                    setToDelete(null);
                    run(`Could not delete ${target.name}`, () => workspace.deleteProject(target.id));
                  }}
                >
                  Delete
                </Button>
                <Button
                  onClick={() => {
                    setToDelete(null);
                  }}
                >
                  Cancel
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      )}
    </div>
  );
}
