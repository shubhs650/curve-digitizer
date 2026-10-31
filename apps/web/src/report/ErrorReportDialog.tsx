import {
  Button,
  Caption1,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  makeStyles,
  Textarea,
  tokens,
} from '@fluentui/react-components';
import { CopyRegular, OpenRegular } from '@fluentui/react-icons';
import { useMemo, useState } from 'react';
import { useProject } from '../session/context';
import { useNotify } from '../ui/notices';
import { useUiStore } from '../ui/uiStore';
import { APP_VERSION } from '../version';
import {
  anonymizeProject,
  describeError,
  describeStep,
  type ErrorReport,
  errorIssueUrl,
  reportText,
} from './report';
import { useReportStore } from './reportStore';

const useStyles = makeStyles({
  surface: {
    maxWidth: '760px',
    width: 'calc(100vw - 32px)',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  report: {
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase200,
  },
});

/**
 * The opt-in error reporter (task 3.7, ARCHITECTURE §11): shows the error, the environment and, if the user
 * ticks it, the anonymized project, for review. It sends nothing; the user opens a prefilled GitHub issue
 * or copies the text.
 */
export function ErrorReportDialog() {
  const pending = useReportStore((s) => s.pending);
  const close = useReportStore((s) => s.close);
  return pending === null ? null : (
    <ReportDialog key={pending.id} error={pending.error} title={pending.title} onClose={close} />
  );
}

function ReportDialog({
  error,
  title,
  onClose,
}: {
  readonly error: unknown;
  readonly title: string | undefined;
  readonly onClose: () => void;
}) {
  const styles = useStyles();
  const notify = useNotify();
  const project = useProject();
  const [includeProject, setIncludeProject] = useState(false);
  // What the user was doing when it failed, not after they moved on to read the report.
  const [step] = useState(() => {
    const ui = useUiStore.getState();
    return describeStep(project, {
      ...ui,
      exported: project !== null && ui.exportedProjects.has(project.id),
    });
  });

  const report: ErrorReport = useMemo(() => {
    const { message, stack } = describeError(error, location.origin);
    return {
      message: title && title !== message ? `${title}: ${message}` : message,
      stack,
      version: APP_VERSION,
      userAgent: navigator.userAgent,
      step,
      project: includeProject && project !== null ? JSON.stringify(anonymizeProject(project), null, 2) : null,
    };
  }, [error, title, step, includeProject, project]);
  const text = reportText(report);
  const issue = errorIssueUrl(report);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      notify({ intent: 'success', title: 'Copied the report' });
    } catch (copyError) {
      notify({
        intent: 'warning',
        title: 'Could not copy the report',
        body: copyError instanceof Error ? copyError.message : String(copyError),
      });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(_, data) => {
        if (!data.open) onClose();
      }}
    >
      <DialogSurface className={styles.surface}>
        <DialogBody>
          <DialogTitle>Report a problem</DialogTitle>
          <DialogContent className={styles.content}>
            <Caption1>
              Nothing has been sent. Read the report below: Open GitHub issue opens a prefilled issue that you
              can edit and submit yourself, or Copy report to paste it anywhere.
            </Caption1>
            <Checkbox
              label="Include the project, anonymized: points, calibration, fits and settings, without names, notes, file names or images"
              checked={includeProject}
              disabled={project === null}
              onChange={(_, data) => {
                setIncludeProject(data.checked === true);
              }}
            />
            <Field label="Report">
              <Textarea className={styles.report} readOnly resize="vertical" rows={14} value={text} />
            </Field>
            {issue.projectLeftOut && (
              <Caption1>
                The project is too long for a link: the issue says to paste it from Copy report.
              </Caption1>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              as="a"
              appearance="primary"
              icon={<OpenRegular />}
              href={issue.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open GitHub issue
            </Button>
            <Button icon={<CopyRegular />} onClick={() => void copy()}>
              Copy report
            </Button>
            <Button onClick={onClose}>Close</Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
