import type { Graph, PdfCropSource } from '@cd/core';
import { capDpi } from '@cd/pdf/geometry';
import { Button, Caption1, Field, makeStyles, Select, Spinner, tokens } from '@fluentui/react-components';
import { ArrowSyncRegular } from '@fluentui/react-icons';
import { useState } from 'react';
import { useProject, useWorkspace, useWorkspaceState } from '../session/context';
import { useNotify } from '../ui/notices';
import { DPI_CHOICES } from './cropDraft';
import { PanelTitle } from '../ui/PanelTitle';

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalL}`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
});

/** The DPIs a crop can be re-rendered at that would actually raise its resolution after the pixel cap (R7). */
export function higherDpis(source: PdfCropSource): readonly number[] {
  return DPI_CHOICES.filter((dpi) => dpi > source.dpi && capDpi(source.rectPt, dpi).dpi > source.dpi);
}

/** Where a PDF-crop graph came from, and "Re-render at higher DPI" (task 1.8, PRD §4.1). */
export function GraphSourcePanel({ graph }: { readonly graph: Graph }) {
  if (graph.source.kind !== 'pdfCrop') return null;
  return <PdfCropSourcePanel graph={graph} source={graph.source} />;
}

function PdfCropSourcePanel({ graph, source }: { readonly graph: Graph; readonly source: PdfCropSource }) {
  const styles = useStyles();
  const workspace = useWorkspace();
  const notify = useNotify();
  const file = useProject()?.sources.find((s) => s.id === source.sourceId);
  const open = useWorkspaceState().pdf[source.sourceId]?.status === 'open';
  const choices = higherDpis(source);
  const [chosen, setChosen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const target = chosen !== null && choices.includes(chosen) ? chosen : choices[choices.length - 1];

  const rerender = async (dpi: number) => {
    setBusy(true);
    try {
      const result = await workspace.rerenderGraph(graph.id, dpi);
      if (result.capped) {
        notify({
          intent: 'info',
          title: `Rendered at ${String(result.dpi)} DPI`,
          body: `${String(dpi)} DPI would exceed the 50-megapixel limit for this crop.`,
        });
      }
    } catch (error) {
      notify({
        intent: 'error',
        title: 'Could not re-render the graph',
        body: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="source-heading" className={styles.panel}>
      <PanelTitle id="source-heading">Source</PanelTitle>
      <Caption1 data-testid="graph-source">
        Page {source.pageIndex + 1} of {file?.fileName ?? 'a PDF'}, {source.dpi} DPI, {graph.image.width} ×{' '}
        {graph.image.height} px
      </Caption1>
      {target === undefined ? (
        <Caption1 className={styles.muted}>This crop is at the highest resolution offered.</Caption1>
      ) : !open ? (
        <Caption1 className={styles.muted}>Open the project&apos;s PDF to re-render this crop.</Caption1>
      ) : (
        <>
          <Field label="Re-render at">
            <Select
              value={String(target)}
              onChange={(_, data) => {
                setChosen(Number(data.value));
              }}
            >
              {choices.map((dpi) => (
                <option key={dpi} value={dpi}>
                  {dpi} DPI
                </option>
              ))}
            </Select>
          </Field>
          <Caption1 className={styles.muted}>
            Points and calibration move with the image; undo goes back to the previous render.
          </Caption1>
          <Button
            icon={busy ? <Spinner size="tiny" /> : <ArrowSyncRegular />}
            disabled={busy}
            onClick={() => {
              void rerender(target);
            }}
          >
            Re-render at higher DPI
          </Button>
        </>
      )}
    </section>
  );
}
