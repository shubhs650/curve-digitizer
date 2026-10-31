import {
  addDataset,
  type Dataset,
  type DatasetPatch,
  type Graph,
  nextDatasetColor,
  removeDataset,
  updateDataset,
} from '@cd/core';
import {
  Button,
  Caption1,
  Field,
  makeStyles,
  Radio,
  RadioGroup,
  Switch,
  tokens,
} from '@fluentui/react-components';
import { AddRegular, DeleteRegular } from '@fluentui/react-icons';
import { useId } from 'react';
import { useActiveDataset, useDispatch } from '../session/context';
import { useUiStore } from '../ui/uiStore';
import { NumberField, TextField } from './fields';
import { PanelTitle } from '../ui/PanelTitle';

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: `0 ${tokens.spacingHorizontalM} ${tokens.spacingVerticalM}`,
    overflowY: 'auto',
    minHeight: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  list: {
    listStyleType: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  item: {
    justifyContent: 'flex-start',
    width: '100%',
    fontWeight: tokens.fontWeightRegular,
  },
  swatch: {
    display: 'inline-block',
    width: '12px',
    height: '12px',
    borderRadius: tokens.borderRadiusCircular,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    flexShrink: 0,
  },
  count: {
    marginInlineStart: 'auto',
    color: tokens.colorNeutralForeground3,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    paddingTop: tokens.spacingVerticalS,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: tokens.spacingHorizontalS,
  },
  colour: {
    width: '100%',
    height: '28px',
    padding: 0,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: 'transparent',
    cursor: 'pointer',
  },
});

/** "Dataset 3", skipping names already in use. */
export function nextDatasetName(datasets: readonly Dataset[]): string {
  const names = new Set(datasets.map((d) => d.name));
  let n = datasets.length + 1;
  while (names.has(`Dataset ${String(n)}`)) n++;
  return `Dataset ${String(n)}`;
}

export function newDataset(graph: Graph, id: string): Dataset {
  return {
    id,
    name: nextDatasetName(graph.datasets),
    color: nextDatasetColor(graph.datasets.map((d) => d.color)),
    mode: 'function',
    xUnit: graph.calibration?.xAxis.unit ?? '',
    yUnit: graph.calibration?.yAxis.unit ?? '',
    sourceRef: '',
    notes: '',
    points: [],
  };
}

const plural = (n: number, one: string, many: string) => `${String(n)} ${n === 1 ? one : many}`;

/** Inspector section listing the graph's datasets and editing the active one (PRD §4.7, task 1.5). */
export function DatasetsPanel({ graph }: { graph: Graph }) {
  const styles = useStyles();
  const dispatch = useDispatch();
  const active = useActiveDataset(graph);
  const setActiveDataset = useUiStore((s) => s.setActiveDataset);

  const add = () => {
    const dataset = newDataset(graph, crypto.randomUUID());
    if (dispatch(addDataset(graph.id, dataset))) setActiveDataset(graph.id, dataset.id);
  };

  return (
    <section aria-labelledby="datasets-heading" className={styles.panel}>
      <div className={styles.header}>
        <PanelTitle id="datasets-heading">Datasets</PanelTitle>
        <Button size="small" appearance="subtle" icon={<AddRegular />} onClick={add}>
          Add dataset
        </Button>
      </div>
      {graph.datasets.length === 0 ? (
        <Caption1>No datasets yet. Add one for each curve you digitize.</Caption1>
      ) : (
        <ul aria-labelledby="datasets-heading" className={styles.list}>
          {graph.datasets.map((d) => (
            <li key={d.id}>
              <Button
                size="small"
                appearance={d.id === active?.id ? 'secondary' : 'subtle'}
                aria-current={d.id === active?.id ? 'true' : undefined}
                className={styles.item}
                icon={<span className={styles.swatch} style={{ backgroundColor: d.color }} />}
                onClick={() => {
                  setActiveDataset(graph.id, d.id);
                }}
              >
                {d.name}
                <span className={styles.count}>{String(d.points.length)}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {active && <DatasetForm key={active.id} graph={graph} dataset={active} />}
    </section>
  );
}

function DatasetForm({ graph, dataset }: { graph: Graph; dataset: Dataset }) {
  const styles = useStyles();
  const dispatch = useDispatch();
  const edit = (patch: DatasetPatch, coalesceKey?: string) =>
    dispatch(updateDataset(graph.id, dataset.id, patch, coalesceKey));
  const colourId = useId();
  const param = dataset.param;
  const excluded = dataset.points.filter((p) => p.excludedFromFit).length;
  const outOfRange = dataset.points.filter((p) => p.outOfRange).length;

  return (
    <div role="group" aria-label={`Dataset ${dataset.name}`} className={styles.form}>
      <TextField
        label="Name"
        value={dataset.name}
        onChange={(name, key) => {
          edit({ name }, key);
        }}
      />
      {/* Field only labels Fluent controls; a native input needs the label pointed at it. */}
      <Field label={{ children: 'Colour', htmlFor: colourId }} size="small">
        <input
          id={colourId}
          type="color"
          className={styles.colour}
          value={dataset.color}
          // Native colour pickers fire input continuously while dragging; one undo step per pick.
          onChange={(event) => {
            edit({ color: event.currentTarget.value }, `colour-${dataset.id}`);
          }}
        />
      </Field>
      <Field label="Mode" size="small">
        <RadioGroup
          value={dataset.mode}
          onChange={(_, data) => {
            if (data.value === 'function' || data.value === 'path') edit({ mode: data.value });
          }}
        >
          <Radio value="function" label="Function, y = f(x)" />
          <Radio value="path" label="Path, in pick order (loops)" />
        </RadioGroup>
      </Field>
      <div className={styles.row}>
        <TextField
          label="X unit"
          value={dataset.xUnit}
          onChange={(xUnit, key) => {
            edit({ xUnit }, key);
          }}
        />
        <TextField
          label="Y unit"
          value={dataset.yUnit}
          onChange={(yUnit, key) => {
            edit({ yUnit }, key);
          }}
        />
      </div>
      <Switch
        label="Family parameter"
        checked={param !== undefined}
        onChange={(_, data) => {
          edit({ param: data.checked ? { name: '', value: 0, unit: '' } : null });
        }}
      />
      {param && (
        <>
          <TextField
            label="Parameter name"
            placeholder="Temperature"
            value={param.name}
            onChange={(name, key) => {
              edit({ param: { ...param, name } }, key);
            }}
          />
          <div className={styles.row}>
            <NumberField
              label="Parameter value"
              value={param.value}
              onChange={(value, key) => {
                if (value !== null) edit({ param: { ...param, value } }, key);
              }}
            />
            <TextField
              label="Parameter unit"
              placeholder="°C"
              value={param.unit}
              onChange={(unit, key) => {
                edit({ param: { ...param, unit } }, key);
              }}
            />
          </div>
        </>
      )}
      <TextField
        label="Source reference"
        placeholder="ASME BPVC VIII-2 (2023) Fig 3-F.1"
        value={dataset.sourceRef}
        onChange={(sourceRef, key) => {
          edit({ sourceRef }, key);
        }}
      />
      <TextField
        label="Notes"
        multiline
        value={dataset.notes}
        onChange={(notes, key) => {
          edit({ notes }, key);
        }}
      />
      <Caption1 data-testid="dataset-summary">
        {plural(dataset.points.length, 'point', 'points')}
        {excluded > 0 && ` · ${String(excluded)} excluded from fit`}
        {outOfRange > 0 && ` · ${String(outOfRange)} out of range`}
      </Caption1>
      <Button
        size="small"
        icon={<DeleteRegular />}
        onClick={() => {
          dispatch(removeDataset(graph.id, dataset.id));
        }}
      >
        Delete dataset
      </Button>
    </div>
  );
}
