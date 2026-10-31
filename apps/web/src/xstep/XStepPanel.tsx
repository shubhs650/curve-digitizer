import { addDataset, type Graph, insertPoints } from '@cd/core';
import { toHexColor } from '@cd/image';
import {
  Button,
  Caption1,
  Field,
  Input,
  makeStyles,
  ProgressBar,
  Radio,
  RadioGroup,
  Textarea,
  tokens,
} from '@fluentui/react-components';
import { DataScatterRegular } from '@fluentui/react-icons';
import { newDataset } from '../inspector/DatasetsPanel';
import { useActiveDataset, useDispatch } from '../session/context';
import { useUiStore } from '../ui/uiStore';
import { cancelXStep, clearXStep, pathDatasetBlock } from './runXStep';
import { defaultRange, resolveXs } from './xValues';
import { type XStepSession, useXStepSession, useXStepStore } from './xstepStore';
import { xstepPoints } from './xstepPoints';
import { PanelTitle } from '../ui/PanelTitle';

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalL}`,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  muted: { color: tokens.colorNeutralForeground3 },
  range: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: tokens.spacingHorizontalS,
    '& .fui-Input': { minWidth: 0 },
  },
  row: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS },
  grow: { flexGrow: 1 },
  actions: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalS },
  error: { color: tokens.colorPaletteRedForeground1 },
});

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** X-step sampling (task 2.6, PRD §4.5): X values by step or list, then a click on the curve. */
export function XStepPanel({ graph }: { graph: Graph }) {
  const styles = useStyles();
  const session = useXStepSession(graph.id);
  const settings = useXStepStore((s) => s.settings);
  const setSettings = useXStepStore((s) => s.setSettings);
  const tool = useUiStore((s) => s.tool);
  const setTool = useUiStore((s) => s.setTool);
  const blocked = pathDatasetBlock(useActiveDataset(graph));

  if (graph.calibration === null || blocked !== null) {
    return (
      <section aria-labelledby="xstep-heading" className={styles.panel}>
        <PanelTitle id="xstep-heading">X-step</PanelTitle>
        <Caption1 className={styles.muted}>
          {graph.calibration === null
            ? 'Calibrate the graph first: the X values are read through the axes.'
            : `${blocked ?? ''}.`}
        </Caption1>
      </section>
    );
  }
  const d = defaultRange(graph);
  const xs = resolveXs(graph, settings);
  const unit = graph.calibration.xAxis.unit;

  return (
    <section aria-labelledby="xstep-heading" className={styles.panel}>
      <PanelTitle id="xstep-heading">X-step</PanelTitle>
      <Caption1 className={styles.muted}>Places one point on a curve at each X value.</Caption1>
      <RadioGroup
        layout="horizontal"
        aria-label="X values"
        value={settings.mode}
        onChange={(_, data) => {
          setSettings({ mode: data.value === 'list' ? 'list' : 'step' });
        }}
      >
        <Radio value="step" label="Every step" />
        <Radio value="list" label="List" />
      </RadioGroup>
      {settings.mode === 'step' ? (
        <div className={styles.range}>
          {(['from', 'to', 'step'] as const).map((key) => (
            <Field key={key} label={key === 'from' ? 'From' : key === 'to' ? 'To' : 'Step'} size="small">
              <Input
                size="small"
                inputMode="decimal"
                placeholder={String(d[key])}
                value={settings[key] ?? ''}
                onChange={(_, data) => {
                  setSettings({ [key]: data.value });
                }}
              />
            </Field>
          ))}
        </div>
      ) : (
        <Field label="X values (commas, spaces or new lines)" size="small">
          <Textarea
            size="small"
            resize="vertical"
            value={settings.list}
            onChange={(_, data) => {
              setSettings({ list: data.value });
            }}
          />
        </Field>
      )}
      <Caption1 role={xs.ok ? undefined : 'alert'} className={xs.ok ? styles.muted : styles.error}>
        {xs.ok ? `${plural(xs.xs.length, 'X value', 'X values')}${unit ? ` in ${unit}` : ''}` : xs.message}
      </Caption1>
      {session === null ? (
        <>
          <Caption1 className={styles.muted}>
            {tool === 'xstep'
              ? 'Click the curve to sample.'
              : 'Choose the tool, then click the curve to sample.'}
          </Caption1>
          {tool !== 'xstep' && (
            <div className={styles.actions}>
              <Button
                size="small"
                icon={<DataScatterRegular />}
                onClick={() => {
                  setTool('xstep');
                }}
              >
                X-step (X)
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

function SessionView({ graph, session }: { graph: Graph; session: XStepSession }) {
  const styles = useStyles();
  const dispatch = useDispatch();
  const dataset = useActiveDataset(graph);
  const setActiveDataset = useUiStore((s) => s.setActiveDataset);
  const points = session.result?.points ?? [];
  const found = points.filter((p) => p.px !== null);
  const outliers = found.filter((p) => p.outlier).length;
  const missing = points.length - found.length;

  const add = () => {
    let target = dataset;
    if (target === null) {
      const color = session.result ? toHexColor(session.result.color) : null;
      target = { ...newDataset(graph, crypto.randomUUID()), ...(color ? { color } : {}) };
      if (!dispatch(addDataset(graph.id, target))) return;
      setActiveDataset(graph.id, target.id);
    }
    const datasetId = target.id;
    const added = xstepPoints(graph, points);
    if (
      dispatch(
        insertPoints(
          graph.id,
          added.map((point) => ({ datasetId, point })),
        ),
      )
    )
      clearXStep();
  };

  return (
    <>
      {session.running && (
        <div className={styles.row}>
          <Field label="Sampling" size="small" className={styles.grow}>
            <ProgressBar value={session.fraction} max={1} />
          </Field>
          <Button size="small" onClick={cancelXStep}>
            Cancel
          </Button>
        </div>
      )}
      {session.error !== null && (
        <Caption1 role="alert" className={styles.error}>
          {session.error}.
        </Caption1>
      )}
      {session.result !== null && (
        <div role="status">
          <Caption1>
            {plural(found.length, 'point', 'points')}
            {outliers > 0 && `, ${plural(outliers, 'outlier', 'outliers')} (red; added excluded from fits)`}
            {missing > 0 && `. The curve does not reach ${plural(missing, 'X value', 'X values')}`}
            {session.result.stoppedAtBranch && ' (the trace stopped where the curve splits)'}.
          </Caption1>
        </div>
      )}
      <div className={styles.actions}>
        <Button
          appearance="primary"
          size="small"
          disabled={found.length === 0 || session.running}
          onClick={add}
        >
          {`Add ${String(found.length)} points to ${dataset?.name ?? 'a new dataset'}`}
        </Button>
        <Button size="small" onClick={clearXStep}>
          Clear
        </Button>
      </div>
    </>
  );
}
