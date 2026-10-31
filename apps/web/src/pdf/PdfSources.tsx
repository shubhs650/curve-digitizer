import type { SourceFile } from '@cd/core';
import {
  Button,
  Caption1,
  makeStyles,
  mergeClasses,
  MessageBar,
  MessageBarBody,
  Spinner,
  Text,
  tokens,
} from '@fluentui/react-components';
import { DocumentPdfRegular, LockClosedRegular } from '@fluentui/react-icons';
import { useEffect } from 'react';
import { useSidebarStyles } from '../project/ProjectSidebar';
import { useWorkspace, useWorkspaceState } from '../session/context';
import { useUiStore } from '../ui/uiStore';
import { useCropDraft } from './cropDraft';
import { PdfThumbnail } from './PdfThumbnail';
import { usePdfActions } from './usePdfActions';

const useStyles = makeStyles({
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  source: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  title: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    minWidth: 0,
  },
  pages: {
    listStyleType: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: tokens.spacingHorizontalS,
  },
  page: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalXXS,
    width: '100%',
    minWidth: 0,
    paddingBlock: tokens.spacingVerticalS,
    paddingInline: tokens.spacingHorizontalXS,
    border: `${tokens.strokeWidthThin} solid transparent`,
  },
  current: {
    border: `${tokens.strokeWidthThick} solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
});

/** The open project's source PDFs and their pages (PRD §4.1); a page opens in the crop view. */
export function PdfSources({ sources }: { readonly sources: readonly SourceFile[] }) {
  const styles = useStyles();
  const sidebarStyles = useSidebarStyles();
  if (sources.length === 0) return null;
  return (
    <section className={styles.section} aria-labelledby="pdfs-heading">
      <h3 id="pdfs-heading" className={sidebarStyles.sectionTitle}>
        PDFs
      </h3>
      {sources.map((source) => (
        <PdfSource key={source.id} source={source} />
      ))}
    </section>
  );
}

function PdfSource({ source }: { readonly source: SourceFile }) {
  const styles = useStyles();
  const workspace = useWorkspace();
  const state = useWorkspaceState().pdf[source.id];
  const { unlockSource } = usePdfActions();
  const cropPage = useUiStore((s) => s.cropPage);
  const setCropPage = useUiStore((s) => s.setCropPage);
  const resetCrop = useCropDraft((s) => s.reset);

  // A reopened project opens its PDFs from storage on first view.
  useEffect(() => {
    if (state === undefined) void workspace.openSource(source.id);
  }, [state, workspace, source.id]);

  const pages = source.pageCount === 1 ? '1 page' : `${String(source.pageCount)} pages`;
  return (
    <section className={styles.source} aria-label={source.fileName}>
      <div className={styles.title}>
        <DocumentPdfRegular aria-hidden="true" />
        <Text weight="semibold" truncate wrap={false} title={source.fileName}>
          {source.fileName}
        </Text>
      </div>
      <Caption1 className={styles.muted}>{pages}</Caption1>
      {(state === undefined || state.status === 'opening') && <Spinner size="tiny" label="Opening…" />}
      {state?.status === 'locked' && (
        <Button
          icon={<LockClosedRegular />}
          onClick={() => {
            unlockSource(source.id, source.fileName);
          }}
        >
          Unlock…
        </Button>
      )}
      {state?.status === 'failed' && (
        <MessageBar intent="error">
          <MessageBarBody>
            {state.unavailable ? 'PDF support could not be loaded. Images still work.' : state.message}
          </MessageBarBody>
        </MessageBar>
      )}
      {state?.status === 'open' && (
        <>
          {!state.permissions.copy && (
            <MessageBar intent="warning">
              <MessageBarBody>
                The author of this PDF does not allow copying its content, so its pages can be viewed but not
                cropped.
              </MessageBarBody>
            </MessageBar>
          )}
          <ul className={styles.pages} aria-label={`Pages of ${source.fileName}`}>
            {state.pages.map((_, i) => {
              const current = cropPage?.sourceId === source.id && cropPage.pageIndex === i;
              return (
                <li key={i}>
                  <Button
                    appearance="subtle"
                    className={mergeClasses(styles.page, current && styles.current)}
                    aria-current={current ? 'true' : undefined}
                    title={`Crop from page ${String(i + 1)}`}
                    onClick={() => {
                      if (current) return;
                      resetCrop();
                      setCropPage({ sourceId: source.id, pageIndex: i });
                    }}
                  >
                    <PdfThumbnail
                      sourceId={source.id}
                      pageIndex={i}
                      label={`Page ${String(i + 1)} of ${source.fileName}`}
                    />
                    <Caption1 aria-hidden="true">{i + 1}</Caption1>
                  </Button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
