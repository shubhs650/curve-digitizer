import { Body1, Button, makeStyles, Title3, tokens } from '@fluentui/react-components';
import { CropRegular, DocumentPdfRegular } from '@fluentui/react-icons';
import { OpenFileButton } from '../input/OpenFileButton';
import { useCropDraft } from '../pdf/cropDraft';
import { useProject } from '../session/context';
import { useUiStore } from '../ui/uiStore';

const useStyles = makeStyles({
  empty: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacingHorizontalXXL,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
    maxWidth: '440px',
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalXXL}`,
    textAlign: 'center',
    borderRadius: tokens.borderRadiusXLarge,
    border: `${tokens.strokeWidthThick} dashed ${tokens.colorBrandStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  icon: {
    fontSize: '48px',
    color: tokens.colorBrandForeground1,
  },
  text: {
    color: tokens.colorNeutralForeground2,
  },
});

/** Canvas content for an open project that has no graph yet. */
export function ProjectEmpty({ onFiles }: { onFiles: (files: File[]) => void }) {
  const styles = useStyles();
  const firstPdf = useProject()?.sources[0];
  const setCropPage = useUiStore((s) => s.setCropPage);
  const resetCrop = useCropDraft((s) => s.reset);
  if (firstPdf) {
    return (
      <div className={styles.empty}>
        <div className={styles.card}>
          <CropRegular className={styles.icon} aria-hidden="true" />
          <Title3 as="h2">Pick a page to crop</Title3>
          <Body1 className={styles.text}>
            Click the page that holds the graph under PDFs in the sidebar. It opens here, where you drag a
            rectangle around the graph.
          </Body1>
          <Button
            appearance="primary"
            size="large"
            icon={<CropRegular />}
            onClick={() => {
              resetCrop();
              setCropPage({ sourceId: firstPdf.id, pageIndex: 0 });
            }}
          >
            Open page 1
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className={styles.empty}>
      <div className={styles.card}>
        <DocumentPdfRegular className={styles.icon} aria-hidden="true" />
        <Title3 as="h2">Add the graph to digitize</Title3>
        <Body1 className={styles.text}>
          Add a PDF or an image of a graph: open it, drop it here, or paste an image with Ctrl+V. A PDF lists
          its pages in the sidebar; pick one to crop the graph from it.
        </Body1>
        <OpenFileButton appearance="primary" size="large" onFiles={onFiles} />
      </div>
    </div>
  );
}
