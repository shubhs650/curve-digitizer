import { addDataset, type Graph, insertPoints, updateDataset } from '@cd/core';
import { toHexColor } from '@cd/image';
import {
  Button,
  Caption1,
  Caption1Strong,
  Field,
  Link,
  makeStyles,
  ProgressBar,
  SpinButton,
  tokens,
} from '@fluentui/react-components';
import { PenSparkleRegular } from '@fluentui/react-icons';
import { useMemo } from 'react';
import { newDataset } from '../inspector/DatasetsPanel';
import { useActiveDataset, useDispatch, useWorkspace } from '../session/context';
import { useReportStore } from '../report/reportStore';
import { useUiStore } from '../ui/uiStore';
import { cancelTrace, clearTrace, runTrace } from './runTrace';
import { tracePoints } from './tracePoints';
import { type TraceSession, useTraceSession, useTraceStore } from './traceStore';

const MIN_SPACING = 1;
const MAX_SPACING = 100;

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalM}`,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  muted: { color: tokens.colorNeutralForeground3 },
  row: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  grow: { flexGrow: 1 },
  swatch: {
    width: '20px',
    height: '20px',
    flexShrink: 0,
    borderRadius: tokens.borderRadiusSmall,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
  },
  actions: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalS },
  error: { color: tokens.colorPaletteRedForeground1 },
});

/** Guided tracing (task 2.4, PRD §4.5): start and end picks, progress, branch prompt, density, add points. */
export function TracePanel({ graph }: { graph: Graph }) {
  const styles = useStyles();
  const session = useTraceSession(graph.id);
  const tool = useUiStore((s) => s.tool);
  const setTool = useUiStore((s) => s.setTool);

  return (
    <section aria-labelledby="trace-heading" className={styles.panel}>
      <Caption1Strong id="trace-heading">Guided trace</Caption1Strong>
      {session === null ? (
        <>
          <Caption1 className={styles.muted}>
            {tool === 'trace'
              ? 'Click the curve where the trace should start.'
              : 'Follows one curve through crossings, grid lines and gaps. Choose the tool, then click the curve.'}
          </Caption1>
          {tool !== 'trace' && (
            <div className={styles.actions}>
              <Button
                size="small"
                icon={<PenSparkleRegular />}
                onClick={() => {
                  setTool('trace');
                }}
              >
                Guided trace (T)
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

function SessionView({ graph, session }: { graph: Graph; session: TraceSession }) {
  const styles = useStyles();
  const workspace = useWorkspace();
  const dispatch = useDispatch();
  const dataset = useActiveDataset(graph);
  const setActiveDataset = useUiStore((s) => s.setActiveDataset);
  const spacing = useTraceStore((s) => s.spacingPx);
  const setSpacing = useTraceStore((s) => s.setSpacing);
  const readFile = (path: string) => workspace.readFile(path);
  const hex = session.color ? toHexColor(session.color) : null;
  const count = useMemo(
    () => tracePoints(graph, session.nodes, spacing, () => '').length,
    [graph, session.nodes, spacing],
  );

  const add = () => {
    let target = dataset;
    if (target === null) {
      target = { ...newDataset(graph, crypto.randomUUID()), ...(hex ? { color: hex } : {}) };
      if (!dispatch(addDataset(graph.id, target))) return;
      setActiveDataset(graph.id, target.id);
    }
    const datasetId = target.id;
    const points = tracePoints(graph, session.nodes, spacing);
    if (
      dispatch(
        insertPoints(
          graph.id,
          points.map((point) => ({ datasetId, point })),
        ),
      )
    )
      clearTrace();
  };

  return (
    <>
      {session.phase === 'end' && (
        <>
          <Caption1>Click where the trace should stop, or trace the whole curve.</Caption1>
          <div className={styles.actions}>
            <Button
              size="small"
              onClick={() => {
                void runTrace(graph, readFile);
              }}
            >
              Trace to the curve ends
            </Button>
          </div>
        </>
      )}
      {session.phase === 'running' && (
        <div className={styles.row}>
          <Field label="Tracing" size="small" className={styles.grow}>
            <ProgressBar value={session.fraction} max={1} />
          </Field>
          <Button size="small" onClick={cancelTrace}>
            Cancel
          </Button>
        </div>
      )}
      {session.phase === 'branch' && (
        <div role="status" className={styles.actions}>
          <Caption1>
            The curve splits here. Click the number of the branch to follow on the canvas, or choose it here.
          </Caption1>
          {session.branches.map((b, i) => (
            <Button
              key={i}
              size="small"
              onClick={() => {
                void runTrace(graph, readFile, b);
              }}
            >
              {`Follow branch ${String(i + 1)}`}
            </Button>
          ))}
          <Button
            size="small"
            onClick={() => {
              useTraceStore
                .getState()
                .setSession((s) => (s ? { ...s, phase: 'done', branches: [], at: null } : s));
            }}
          >
            Stop here
          </Button>
        </div>
      )}
      {session.phase === 'error' && session.error !== null && (
        <Caption1 role="alert" className={styles.error}>
          {session.error}. Click on a curve to start again.{' '}
          <Link
            as="button"
            inline
            onClick={() => {
              useReportStore
                .getState()
                .open({ error: session.cause ?? session.error, title: 'Trace failed' });
            }}
          >
            Report this error…
          </Link>
        </Caption1>
      )}
      {session.phase === 'done' && (
        <Caption1 className={styles.muted}>
          {session.end !== null && !session.reachedEnd
            ? 'The trace stopped before the end point (the curve ends or fades there).'
            : 'Traced. Check the blue line on the canvas, then add the points.'}
        </Caption1>
      )}
      {hex !== null && (
        <div className={styles.row}>
          <span className={styles.swatch} style={{ backgroundColor: hex }} aria-hidden="true" />
          <Caption1 className={styles.grow}>Curve colour {hex}</Caption1>
          {dataset !== null && dataset.color.toLowerCase() !== hex && (
            <Button
              size="small"
              onClick={() => {
                dispatch(updateDataset(graph.id, dataset.id, { color: hex }));
              }}
            >
              {`Use for ${dataset.name}`}
            </Button>
          )}
        </div>
      )}
      <Field label="Point spacing (px)" size="small">
        <SpinButton
          size="small"
          min={MIN_SPACING}
          max={MAX_SPACING}
          value={spacing}
          onChange={(_, data) => {
            const value = data.value ?? Number(data.displayValue);
            if (Number.isFinite(value)) setSpacing(Math.min(MAX_SPACING, Math.max(MIN_SPACING, value)));
          }}
        />
      </Field>
      <div className={styles.actions}>
        <Button
          appearance="primary"
          size="small"
          disabled={count === 0 || session.phase === 'running'}
          onClick={add}
        >
          {`Add ${String(count)} points to ${dataset?.name ?? 'a new dataset'}`}
        </Button>
        <Button size="small" onClick={clearTrace}>
          Clear
        </Button>
      </div>
    </>
  );
}
