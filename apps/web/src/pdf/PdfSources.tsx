import type { SourceFile } from '@cd/core';
import {
  Button,
  Caption1,
  Caption1Strong,
  makeStyles,
  MessageBar,
  MessageBarBody,
  Spinner,
  Text,
  tokens,
} from '@fluentui/react-components';
import { DocumentPdfRegular, LockClosedRegular } from '@fluentui/react-icons';
import { useEffect } from 'react';
import { useWorkspace, useWorkspaceState } from '../session/context';
import { PdfThumbnail } from './PdfThumbnail';
import { usePdfActions } from './usePdfActions';

const useStyles = makeStyles({
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
  },
});

/** The open project's source PDFs and their pages (PRD §4.1). Cropping a page into a graph comes in task 1.8. */
export function PdfSources({ sources }: { readonly sources: readonly SourceFile[] }) {
  if (sources.length === 0) return null;
  return (
    <>
      <Caption1Strong id="pdfs-heading">PDFs</Caption1Strong>
      {sources.map((source) => (
        <PdfSource key={source.id} source={source} />
      ))}
    </>
  );
}

function PdfSource({ source }: { readonly source: SourceFile }) {
  const styles = useStyles();
  const workspace = useWorkspace();
  const state = useWorkspaceState().pdf[source.id];
  const { unlockSource } = usePdfActions();

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
      <Caption1>{pages}</Caption1>
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
            {state.pages.map((_, i) => (
              <li key={i} className={styles.page}>
                <PdfThumbnail
                  sourceId={source.id}
                  pageIndex={i}
                  label={`Page ${String(i + 1)} of ${source.fileName}`}
                />
                <Caption1 aria-hidden="true">{i + 1}</Caption1>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
