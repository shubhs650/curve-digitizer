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
  Subtitle2,
  Text,
  Title2,
  Title3,
  tokens,
} from '@fluentui/react-components';
import {
  AddRegular,
  ArrowDownloadRegular,
  ArrowUploadRegular,
  CropRegular,
  DataScatterRegular,
  DeleteRegular,
  FolderOpenRegular,
  ImageSparkleRegular,
  LockClosedRegular,
  RulerRegular,
} from '@fluentui/react-icons';
import { type ReactElement, useState } from 'react';
import { OpenFileButton } from '../input/OpenFileButton';
import { useWorkspace, useWorkspaceState } from '../session/context';
import type { ProjectSummary } from '../storage/repository';
import { useNotify } from '../ui/notices';
import { useUiStore } from '../ui/uiStore';
import { DEMOS, openDemo } from './demos';
import darkBgPreview from './previews/dark-bg.webp?url';
import scanTiltedPreview from './previews/scan-tilted.webp?url';
import snFamilyPreview from './previews/sn-family.webp?url';
import vectorCleanPreview from './previews/vector-clean.webp?url';

/** Small previews of the samples (scripts/gen-previews.py); the full images load only when a sample opens. */
const PREVIEWS: Readonly<Record<string, string>> = {
  'vector-clean': vectorCleanPreview,
  'scan-tilted': scanTiltedPreview,
  'sn-family': snFamilyPreview,
  'dark-bg': darkBgPreview,
};

/** The four steps of the getting-started guide (PRD §4.11), as the home screen introduces them. */
const STEPS: readonly { readonly title: string; readonly text: string; readonly icon: ReactElement }[] = [
  {
    title: 'Crop',
    text: 'Open a PDF and drag a rectangle around the graph. It is rendered at up to 600 DPI.',
    icon: <CropRegular />,
  },
  {
    title: 'Calibrate',
    text: 'Click two labelled ticks on each axis and type their values. Linear and log axes.',
    icon: <RulerRegular />,
  },
  {
    title: 'Digitize',
    text: 'Click points, trace a curve, or pick it by colour. Points snap to the line.',
    icon: <DataScatterRegular />,
  },
  {
    title: 'Export',
    text: 'CSV, Excel with live formulas, or a fitted equation as code in six languages.',
    icon: <ArrowDownloadRegular />,
  },
];

const useStyles = makeStyles({
  scroll: {
    position: 'absolute',
    inset: 0,
    overflowY: 'auto',
    backgroundColor: tokens.colorNeutralBackground2,
  },
  home: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXXL,
    maxWidth: '1040px',
    marginInline: 'auto',
    padding: `${tokens.spacingVerticalXXXL} ${tokens.spacingHorizontalXXL}`,
    '@media (max-width: 899px)': {
      padding: `${tokens.spacingVerticalXL} ${tokens.spacingHorizontalL}`,
    },
  },
  hero: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1.15fr) minmax(0, 1fr)',
    gap: tokens.spacingHorizontalXXL,
    alignItems: 'center',
    '@media (max-width: 899px)': {
      gridTemplateColumns: 'minmax(0, 1fr)',
    },
  },
  intro: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  title: {
    fontSize: tokens.fontSizeHero800,
    lineHeight: tokens.lineHeightHero800,
    fontWeight: tokens.fontWeightSemibold,
    margin: 0,
    '@media (max-width: 899px)': {
      fontSize: tokens.fontSizeBase600,
      lineHeight: tokens.lineHeightBase600,
    },
  },
  lead: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase400,
    lineHeight: tokens.lineHeightBase400,
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
    marginTop: tokens.spacingVerticalS,
  },
  note: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
  },
  drop: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalS,
    minHeight: '220px',
    padding: tokens.spacingHorizontalXL,
    boxSizing: 'border-box',
    textAlign: 'center',
    borderRadius: tokens.borderRadiusXLarge,
    border: `${tokens.strokeWidthThick} dashed ${tokens.colorBrandStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground2,
  },
  dropIcon: {
    fontSize: '40px',
    color: tokens.colorBrandForeground1,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  sectionHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: tokens.spacingHorizontalM,
    flexWrap: 'wrap',
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  grid: {
    listStyleType: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: tokens.spacingHorizontalM,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalL,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow2,
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  stepIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    flexShrink: 0,
    borderRadius: tokens.borderRadiusMedium,
    fontSize: '20px',
    color: tokens.colorBrandForeground1,
    backgroundColor: tokens.colorBrandBackground2,
  },
  stepText: {
    color: tokens.colorNeutralForeground2,
  },
  project: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  projectText: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minWidth: 0,
  },
  sample: {
    padding: 0,
    overflow: 'hidden',
  },
  preview: {
    display: 'block',
    width: '100%',
    aspectRatio: '4 / 3',
    objectFit: 'cover',
    objectPosition: 'center',
    backgroundColor: tokens.colorNeutralBackground3,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  sampleBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    flexGrow: 1,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalL} ${tokens.spacingVerticalL}`,
  },
  sampleSummary: {
    flexGrow: 1,
    color: tokens.colorNeutralForeground2,
  },
  sampleButton: {
    alignSelf: 'flex-start',
    marginTop: tokens.spacingVerticalS,
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
    <div className={styles.scroll}>
      <div className={styles.home}>
        <section className={styles.hero} aria-labelledby="home-title">
          <div className={styles.intro}>
            <h2 id="home-title" className={styles.title}>
              Digitize graphs from PDFs and images
            </h2>
            <Body1 className={styles.lead}>
              Crop a figure from a PDF at full resolution, calibrate its axes, trace the curves, and export
              the data or a fitted equation.
            </Body1>
            <div className={styles.actions}>
              <OpenFileButton appearance="primary" size="large" onFiles={onFiles} />
              <Button
                size="large"
                icon={<AddRegular />}
                onClick={() => {
                  run('Could not create the project', () => workspace.createProject());
                }}
              >
                New project
              </Button>
            </div>
            <Caption1 className={styles.note}>
              <LockClosedRegular aria-hidden="true" />
              Everything stays on this device: no upload, no account, works offline.
            </Caption1>
            <Caption1 className={styles.muted}>Works best with Chromium browsers (Chrome, Edge).</Caption1>
          </div>
          <div className={styles.drop} data-testid="home-drop-zone">
            <ArrowUploadRegular className={styles.dropIcon} aria-hidden="true" />
            <Subtitle2 as="p">Drop a PDF or image anywhere on this window</Subtitle2>
            <Caption1>or paste an image with Ctrl+V. PDF, PNG, JPEG, WebP and saved .cdz projects.</Caption1>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="how-heading">
          <Title3 as="h2" id="how-heading">
            How it works
          </Title3>
          <ol className={styles.grid} aria-labelledby="how-heading">
            {STEPS.map((step, i) => (
              <li key={step.title} className={styles.card}>
                <div className={styles.step}>
                  <span className={styles.stepIcon} aria-hidden="true">
                    {step.icon}
                  </span>
                  <Subtitle2 as="h3">
                    {i + 1}. {step.title}
                  </Subtitle2>
                </div>
                <Caption1 className={styles.stepText}>{step.text}</Caption1>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.section} aria-labelledby="projects-heading">
          <div className={styles.sectionHead}>
            <Title2 as="h2" id="projects-heading">
              Projects
            </Title2>
            {projects.length > 0 && (
              <Caption1 className={styles.muted}>Saved in this browser, on this device</Caption1>
            )}
          </div>
          {projects.length === 0 ? (
            <Body1 className={styles.muted}>No saved projects yet.</Body1>
          ) : (
            <ul aria-label="Saved projects" className={styles.grid}>
              {projects.map((p) => (
                <li key={p.id} className={`${styles.card} ${styles.project}`}>
                  <div className={styles.projectText}>
                    <Text weight="semibold" truncate wrap={false} title={p.name}>
                      {p.name}
                    </Text>
                    <Caption1 className={styles.muted}>
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
        </section>

        <section className={styles.section} aria-labelledby="samples-heading">
          <div className={styles.sectionHead}>
            <Title3 as="h2" id="samples-heading">
              Try a sample
            </Title3>
            <Caption1 className={styles.muted}>
              Opens calibrated, with an empty dataset per curve, ready for points or a trace.
            </Caption1>
          </div>
          <ul aria-label="Samples" className={styles.grid}>
            {DEMOS.map((demo) => (
              <li key={demo.sample} className={`${styles.card} ${styles.sample}`}>
                <img
                  src={PREVIEWS[demo.sample]}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className={styles.preview}
                />
                <div className={styles.sampleBody}>
                  <Text weight="semibold">{demo.title}</Text>
                  <Caption1 className={styles.sampleSummary}>{demo.summary}</Caption1>
                  <Button
                    className={styles.sampleButton}
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
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
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
