import { addDataset, type Graph, insertPoints } from '@cd/core';
import { toHexColor } from '@cd/image';
import {
  Button,
  Caption1,
  Checkbox,
  Field,
  makeStyles,
  ProgressBar,
  Slider,
  tokens,
} from '@fluentui/react-components';
import { ColorLineRegular } from '@fluentui/react-icons';
import { useEffect, useRef, useState } from 'react';
import { newDataset } from '../inspector/DatasetsPanel';
import { useActiveDataset, useDispatch, useWorkspace } from '../session/context';
import { useUiStore } from '../ui/uiStore';
import { maskPoints } from './maskPoints';
import { type MaskSession, toggleKept, useMaskSession } from './maskStore';
import { cancelMask, clearMask, runMask } from './runMask';
import { PanelTitle } from '../ui/PanelTitle';

/** Slider edits closer together than this start one re-run. */
const DEBOUNCE_MS = 200;
const MIN_TOLERANCE = 5;
const MAX_TOLERANCE = 80;

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalL}`,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  muted: { color: tokens.colorNeutralForeground3 },
  row: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  swatch: {
    width: '20px',
    height: '20px',
    flexShrink: 0,
    borderRadius: tokens.borderRadiusSmall,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
  },
  list: { listStyleType: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' },
  actions: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalS },
  error: { color: tokens.colorPaletteRedForeground1 },
  grow: { flexGrow: 1 },
});

/** Colour-mask tracing (task 2.5, PRD §4.5): pick a colour, tune the tolerance, keep components, add points. */
export function MaskPanel({ graph }: { graph: Graph }) {
  const styles = useStyles();
  const session = useMaskSession(graph.id);
  const tool = useUiStore((s) => s.tool);
  const setTool = useUiStore((s) => s.setTool);

  return (
    <section aria-labelledby="mask-heading" className={styles.panel}>
      <PanelTitle id="mask-heading">Colour mask</PanelTitle>
      {session === null ? (
        <>
          <Caption1 className={styles.muted}>
            {tool === 'mask'
              ? 'Click a curve on the canvas to find every curve of its colour.'
              : 'Finds every curve of one colour. Choose the tool, then click a curve.'}
          </Caption1>
          {tool !== 'mask' && (
            <div className={styles.actions}>
              <Button
                size="small"
                icon={<ColorLineRegular />}
                onClick={() => {
                  setTool('mask');
                }}
              >
                Colour mask (M)
              </Button>
            </div>
          )}
        </>
      ) : (
        <SessionView graph={graph} session={session} />
      )}
    </section>
  );
}

function SessionView({ graph, session }: { graph: Graph; session: MaskSession }) {
  const styles = useStyles();
  const workspace = useWorkspace();
  const dispatch = useDispatch();
  const dataset = useActiveDataset(graph);
  const setActiveDataset = useUiStore((s) => s.setActiveDataset);
  const components = session.result?.components ?? [];
  const hex = session.color ? toHexColor(session.color) : null;
  const [tolerance, setTolerance] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = tolerance ?? session.tolerance;

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const retune = (value: number) => {
    setTolerance(value);
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      setTolerance(null);
      void runMask(graph, (path) => workspace.readFile(path), {
        pick: session.pick,
        ...(session.color ? { color: session.color } : {}),
        tolerance: value,
      });
    }, DEBOUNCE_MS);
  };

  const count = components.reduce((n, c, i) => n + (session.kept.has(i) ? c.points.length : 0), 0);
  const add = () => {
    const points = maskPoints(graph, components, session.kept);
    let target = dataset;
    if (target === null) {
      target = { ...newDataset(graph, crypto.randomUUID()), ...(hex ? { color: hex } : {}) };
      if (!dispatch(addDataset(graph.id, target))) return;
      setActiveDataset(graph.id, target.id);
    }
    const datasetId = target.id;
    if (
      dispatch(
        insertPoints(
          graph.id,
          points.map((point) => ({ datasetId, point })),
        ),
      )
    )
      clearMask();
  };

  return (
    <>
      {hex !== null && (
        <div className={styles.row}>
          <span className={styles.swatch} style={{ backgroundColor: hex }} aria-hidden="true" />
          <Caption1>Curve colour {hex}</Caption1>
        </div>
      )}
      {shown !== null && (
        <Field label={`Colour tolerance (ΔE): ${String(Math.round(shown))}`} size="small">
          <Slider
            size="small"
            min={MIN_TOLERANCE}
            max={MAX_TOLERANCE}
            step={1}
            value={Math.round(shown)}
            onChange={(_, data) => {
              retune(data.value);
            }}
          />
        </Field>
      )}
      {session.running && (
        <div className={styles.row}>
          <Field label="Finding curves" size="small" className={styles.grow}>
            <ProgressBar value={session.fraction} max={1} />
          </Field>
          <Button size="small" onClick={cancelMask}>
            Cancel
          </Button>
        </div>
      )}
      {session.error !== null && (
        <Caption1 role="alert" className={styles.error}>
          {session.error}. Click on a curve.
        </Caption1>
      )}
      {session.result !== null &&
        (components.length === 0 ? (
          <Caption1 className={styles.muted}>
            No curves of this colour. Raise the tolerance or pick again.
          </Caption1>
        ) : (
          <>
            <Caption1 className={styles.muted}>
              Kept curves are blue on the canvas. Click a curve there or tick it here to keep or drop it.
            </Caption1>
            <ul aria-label="Curves found" className={styles.list}>
              {components.map((c, i) => (
                <li key={i}>
                  <Checkbox
                    label={`Curve ${String(i + 1)}, ${String(Math.round(c.lengthPx))} px long`}
                    checked={session.kept.has(i)}
                    onChange={() => {
                      toggleKept(i);
                    }}
                  />
                </li>
              ))}
            </ul>
          </>
        ))}
      <div className={styles.actions}>
        <Button appearance="primary" size="small" disabled={count === 0} onClick={add}>
          {`Add ${String(count)} points to ${dataset?.name ?? 'a new dataset'}`}
        </Button>
        <Button size="small" onClick={clearMask}>
          Clear
        </Button>
      </div>
    </>
  );
}
