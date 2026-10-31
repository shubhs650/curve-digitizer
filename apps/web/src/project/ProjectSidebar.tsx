import {
  Button,
  Caption1,
  CounterBadge,
  makeStyles,
  mergeClasses,
  Subtitle2,
  tokens,
} from '@fluentui/react-components';
import { ArrowLeftRegular, ImageRegular } from '@fluentui/react-icons';
import { ExportMenu } from '../export/ExportMenu';
import { GuideChecklist } from '../help/GuideChecklist';
import { OpenFileButton } from '../input/OpenFileButton';
import { PdfSources } from '../pdf/PdfSources';
import { useActiveGraph, useProject, useWorkspace } from '../session/context';
import { useUiStore } from '../ui/uiStore';
import { SaveProjectButton } from './SaveProjectButton';

export const useSidebarStyles = makeStyles({
  /** A small upper-case section title, as in file explorers and digitizers' side panels. */
  sectionTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    fontWeight: tokens.fontWeightSemibold,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    margin: 0,
  },
});

const useStyles = makeStyles({
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    flexGrow: 1,
    minHeight: 0,
  },
  scroll: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    flexGrow: 1,
    minHeight: 0,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
    overflowY: 'auto',
    // Children keep their height and the panel scrolls; shrinking squashed Fluent buttons, which clip.
    '& > *': { flexShrink: 0 },
  },
  head: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: tokens.spacingVerticalXS,
  },
  back: {
    marginLeft: `calc(-1 * ${tokens.spacingHorizontalS})`,
  },
  name: {
    display: 'block',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  actions: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: tokens.spacingHorizontalS,
    // Half-width buttons keep their label on one line.
    '& > button': {
      minWidth: 0,
      paddingInline: tokens.spacingHorizontalS,
      whiteSpace: 'nowrap',
    },
  },
  wide: {
    gridColumn: '1 / -1',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  list: {
    listStyleType: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  graph: {
    justifyContent: 'flex-start',
    width: '100%',
    fontWeight: tokens.fontWeightRegular,
  },
  current: {
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorBrandForeground1,
    backgroundColor: tokens.colorBrandBackground2,
    ':hover': {
      color: tokens.colorBrandForeground1,
      backgroundColor: tokens.colorBrandBackground2Hover,
    },
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  footer: {
    flexShrink: 0,
    maxHeight: '45%',
    overflowY: 'auto',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalM}`,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
});

export interface ProjectSidebarProps {
  readonly onFiles: (files: File[]) => void;
}

/** The open project's graphs and source PDFs, its file actions, and the getting-started guide at the foot. */
export function ProjectSidebar({ onFiles }: ProjectSidebarProps) {
  const styles = useStyles();
  const sidebarStyles = useSidebarStyles();
  const workspace = useWorkspace();
  const project = useProject();
  const active = useActiveGraph();
  const setActiveGraph = useUiStore((s) => s.setActiveGraph);

  if (!project) return null;

  return (
    <div className={styles.sidebar}>
      <div className={styles.scroll}>
        <div className={styles.head}>
          <Button
            appearance="subtle"
            size="small"
            className={styles.back}
            icon={<ArrowLeftRegular />}
            onClick={() => {
              setActiveGraph(null);
              workspace.closeProject();
            }}
          >
            All projects
          </Button>
          <Subtitle2 as="h2" className={styles.name} title={project.name}>
            {project.name}
          </Subtitle2>
        </div>
        <div className={styles.actions}>
          <OpenFileButton className={styles.wide} label="Add PDF or image…" onFiles={onFiles} />
          <SaveProjectButton project={project} />
          <ExportMenu project={project} graph={active} />
        </div>
        <section className={styles.section} aria-labelledby="graphs-heading">
          <h3 className={sidebarStyles.sectionTitle}>
            <span id="graphs-heading">Graphs</span>
            {project.graphs.length > 0 && (
              <CounterBadge
                count={project.graphs.length}
                size="small"
                appearance="ghost"
                color="informative"
                aria-hidden="true"
              />
            )}
          </h3>
          {project.graphs.length === 0 ? (
            <Caption1 className={styles.muted}>No graphs yet.</Caption1>
          ) : (
            <ul aria-labelledby="graphs-heading" className={styles.list}>
              {project.graphs.map((g) => {
                const current = g.id === active?.id;
                return (
                  <li key={g.id}>
                    <Button
                      appearance="subtle"
                      aria-current={current ? 'true' : undefined}
                      icon={<ImageRegular />}
                      className={mergeClasses(styles.graph, current && styles.current)}
                      onClick={() => {
                        setActiveGraph(g.id);
                      }}
                    >
                      {g.name}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <PdfSources sources={project.sources} />
      </div>
      <div className={styles.footer}>
        <GuideChecklist />
      </div>
    </div>
  );
}
