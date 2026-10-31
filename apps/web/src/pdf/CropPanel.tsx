import {
  Button,
  Caption1,
  Field,
  makeStyles,
  MessageBar,
  MessageBarBody,
  Select,
  Spinner,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowRotateClockwiseRegular,
  ArrowRotateCounterclockwiseRegular,
  CropRegular,
  FullScreenMaximizeRegular,
  ImageSplitRegular,
} from '@fluentui/react-icons';
import { capDpi, cropPixelSize } from '@cd/pdf/geometry';
import { useState } from 'react';
import { useProject, useWorkspace, useWorkspaceState } from '../session/context';
import { type CropPage, useUiStore } from '../ui/uiStore';
import { useNotify } from '../ui/notices';
import { decodeReference } from '../reference/ReferencePanel';
import { useReferenceStore } from '../reference/referenceStore';
import { cropRotation, DPI_CHOICES, turn, useCropDraft, wholePage } from './cropDraft';
import { PanelTitle } from '../ui/PanelTitle';

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalL}`,
    overflowY: 'auto',
    // Children keep their height and the panel scrolls; shrinking squashed Fluent buttons, which clip.
    '& > *': { flexShrink: 0 },
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  numbers: {
    fontVariantNumeric: 'tabular-nums',
  },
});

/** Sets up a crop of a PDF page and adds it to the project as a graph (task 1.8, PRD §4.1). */
export function CropPanel({ page }: { readonly page: CropPage }) {
  const styles = useStyles();
  const workspace = useWorkspace();
  const notify = useNotify();
  const project = useProject();
  const source = project?.sources.find((s) => s.id === page.sourceId);
  const state = useWorkspaceState().pdf[page.sourceId];
  const geometry = state?.status === 'open' ? state.pages[page.pageIndex] : undefined;
  const draft = useCropDraft((s) => s.draft);
  const update = useCropDraft((s) => s.update);
  const setActiveGraph = useUiStore((s) => s.setActiveGraph);
  const setCropPage = useUiStore((s) => s.setCropPage);
  const activeGraphId = useUiStore((s) => s.activeGraphId);
  const target = project?.graphs.find((g) => g.id === activeGraphId);
  const setReference = useReferenceStore((s) => s.setReference);
  const [busy, setBusy] = useState(false);

  const fileName = source?.fileName ?? 'PDF';
  const canCopy = state?.status === 'open' && state.permissions.copy;
  const rotation = geometry ? cropRotation(geometry, draft.turn) : 0;
  const capped = draft.rectPt ? capDpi(draft.rectPt, draft.dpi) : null;
  const size = draft.rectPt && capped ? cropPixelSize(draft.rectPt, capped.dpi, rotation) : null;

  const crop = async () => {
    if (!draft.rectPt) return;
    setBusy(true);
    try {
      const result = await workspace.cropPdf(page.sourceId, {
        pageIndex: page.pageIndex,
        rectPt: draft.rectPt,
        dpi: draft.dpi,
        rotation,
      });
      setActiveGraph(result.graphId);
    } catch (error) {
      notify({
        intent: 'error',
        title: 'Could not crop the page',
        body: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  /** Lays the crop over the active graph instead of adding a graph (task 3.6). */
  const applyAsReference = async () => {
    if (!draft.rectPt || !target) return;
    setBusy(true);
    try {
      const { png } = await workspace.renderCropPng(page.sourceId, {
        pageIndex: page.pageIndex,
        rectPt: draft.rectPt,
        dpi: draft.dpi,
        rotation,
      });
      setReference(target.id, `${fileName} p${String(page.pageIndex + 1)}`, await decodeReference(png));
      setCropPage(null);
    } catch (error) {
      notify({
        intent: 'error',
        title: 'Could not use the crop as a reference',
        body: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="crop-heading" className={styles.panel}>
      <PanelTitle id="crop-heading">Crop</PanelTitle>
      <Caption1>
        Page {page.pageIndex + 1} of {fileName}
      </Caption1>
      {state?.status === 'open' && !canCopy && (
        <MessageBar intent="warning">
          <MessageBarBody>
            The author of this PDF does not allow copying its content, so its pages cannot be cropped.
          </MessageBarBody>
        </MessageBar>
      )}
      <Caption1 className={styles.muted}>
        Drag a rectangle around the graph on the page. Only that region is rendered, at the resolution below.
      </Caption1>
      <Button
        icon={<FullScreenMaximizeRegular />}
        disabled={!geometry}
        onClick={() => {
          if (geometry) update({ rectPt: wholePage(geometry) });
        }}
      >
        Whole page
      </Button>
      <Field label="Resolution">
        <Select
          value={String(draft.dpi)}
          onChange={(_, data) => {
            update({ dpi: Number(data.value) });
          }}
        >
          {DPI_CHOICES.map((dpi) => (
            <option key={dpi} value={dpi}>
              {dpi} DPI
            </option>
          ))}
        </Select>
      </Field>
      <div className={styles.row}>
        <Button
          icon={<ArrowRotateCounterclockwiseRegular />}
          aria-label="Rotate left"
          title="Rotate left"
          onClick={() => {
            update({ turn: turn(draft.turn, -1) });
          }}
        />
        <Button
          icon={<ArrowRotateClockwiseRegular />}
          aria-label="Rotate right"
          title="Rotate right"
          onClick={() => {
            update({ turn: turn(draft.turn, 1) });
          }}
        />
        <Caption1 data-testid="crop-turn">Turned {draft.turn}°</Caption1>
      </div>
      {size && capped && (
        <Caption1 className={styles.numbers} data-testid="crop-size">
          {size.width} × {size.height} px at {capped.dpi} DPI
        </Caption1>
      )}
      {capped?.capped && (
        <MessageBar intent="info">
          <MessageBarBody>
            {draft.dpi} DPI would exceed the 50-megapixel limit, so this crop will be rendered at {capped.dpi}{' '}
            DPI.
          </MessageBarBody>
        </MessageBar>
      )}
      <div className={styles.row}>
        <Button
          appearance="primary"
          icon={busy ? <Spinner size="tiny" /> : <CropRegular />}
          disabled={!draft.rectPt || !canCopy || busy}
          onClick={() => {
            void crop();
          }}
        >
          Crop to new graph
        </Button>
        {target && (
          <Button
            icon={<ImageSplitRegular />}
            disabled={!draft.rectPt || !canCopy || busy}
            onClick={() => {
              void applyAsReference();
            }}
          >
            Use as reference for {target.name}
          </Button>
        )}
        <Button
          onClick={() => {
            setCropPage(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </section>
  );
}
