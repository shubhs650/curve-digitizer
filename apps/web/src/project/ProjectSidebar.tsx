import { Button, Caption1, Caption1Strong, makeStyles, Text, tokens } from '@fluentui/react-components';
import { ArrowLeftRegular, ImageRegular } from '@fluentui/react-icons';
import { ExportMenu } from '../export/ExportMenu';
import { OpenFileButton } from '../input/OpenFileButton';
import { PdfSources } from '../pdf/PdfSources';
import { useActiveGraph, useProject, useWorkspace } from '../session/context';
import { useUiStore } from '../ui/uiStore';
import { SaveProjectButton } from './SaveProjectButton';

const useStyles = makeStyles({
  sidebar: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalS,
    minHeight: 0,
    overflowY: 'auto',
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
});

export interface ProjectSidebarProps {
  readonly onFiles: (files: File[]) => void;
}

/** The open project's graphs and source PDFs; on the home screen it only says that no project is open. */
export function ProjectSidebar({ onFiles }: ProjectSidebarProps) {
  const styles = useStyles();
  const workspace = useWorkspace();
  const project = useProject();
  const active = useActiveGraph();
  const setActiveGraph = useUiStore((s) => s.setActiveGraph);

  if (!project) {
    return (
      <div className={styles.sidebar}>
        <Caption1>No project open.</Caption1>
      </div>
    );
  }

  return (
    <div className={styles.sidebar}>
      <Button
        appearance="subtle"
        icon={<ArrowLeftRegular />}
        onClick={() => {
          setActiveGraph(null);
          workspace.closeProject();
        }}
      >
        All projects
      </Button>
      <Text weight="semibold" truncate wrap={false} title={project.name}>
        {project.name}
      </Text>
      <Caption1Strong id="graphs-heading">Graphs</Caption1Strong>
      {project.graphs.length === 0 ? (
        <Caption1>No graphs yet.</Caption1>
      ) : (
        <ul aria-labelledby="graphs-heading" className={styles.list}>
          {project.graphs.map((g) => (
            <li key={g.id}>
              <Button
                appearance={g.id === active?.id ? 'secondary' : 'subtle'}
                aria-current={g.id === active?.id ? 'true' : undefined}
                icon={<ImageRegular />}
                className={styles.graph}
                onClick={() => {
                  setActiveGraph(g.id);
                }}
              >
                {g.name}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <OpenFileButton label="Add PDF or image…" onFiles={onFiles} />
      <SaveProjectButton project={project} />
      <ExportMenu project={project} graph={active} />
      <PdfSources sources={project.sources} />
    </div>
  );
}
