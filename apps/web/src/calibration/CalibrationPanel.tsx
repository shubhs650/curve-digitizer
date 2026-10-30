import type { Axis, Graph } from '@cd/core';
import {
  Badge,
  Button,
  Caption1,
  Caption1Strong,
  Field,
  makeStyles,
  MessageBar,
  MessageBarBody,
  Radio,
  RadioGroup,
  Switch,
  ToggleButton,
  tokens,
} from '@fluentui/react-components';
import { DismissRegular } from '@fluentui/react-icons';
import { TextField } from '../inspector/fields';
import { useUiStore } from '../ui/uiStore';
import {
  type CalibrationDraft,
  type DraftEvaluation,
  numberText,
  PICKS,
  type PickIndex,
  type ValueField,
} from './draft';
import { PICK_COLOURS } from './overlay';
import { useCalibrationEditor } from './useCalibrationEditor';

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: `0 ${tokens.spacingHorizontalM} ${tokens.spacingVerticalM}`,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  axis: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    paddingTop: tokens.spacingVerticalS,
    borderTop: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingHorizontalS,
  },
  pick: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    alignItems: 'end',
    gap: tokens.spacingHorizontalS,
  },
  place: {
    minWidth: '76px',
  },
  marker: {
    fontWeight: tokens.fontWeightSemibold,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  summary: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
    fontVariantNumeric: 'tabular-nums',
  },
});

const VALUE_FIELDS: Readonly<Record<PickIndex, ValueField>> = { 0: 'x1', 1: 'x2', 2: 'y1', 3: 'y2' };

/** The calibration section of the inspector (task 1.3, PRD §4.3). */
export function CalibrationPanel({ graph }: { graph: Graph }) {
  const styles = useStyles();
  const editor = useCalibrationEditor(graph);
  const { draft, evaluation } = editor;
  const calibrated = graph.calibration !== null;

  return (
    <section aria-labelledby="calibration-heading" className={styles.panel}>
      <div className={styles.header}>
        <Caption1Strong id="calibration-heading">Calibration</Caption1Strong>
        <Badge
          appearance="tint"
          color={calibrated ? 'success' : 'informative'}
          data-testid="calibration-status"
        >
          {calibrated ? 'Calibrated' : 'Not calibrated'}
        </Badge>
      </div>
      <Caption1 className={styles.muted}>
        Click two labelled ticks on the X axis and two on the Y axis, then type their values.
      </Caption1>
      <AxisGroup editor={editor} axis="x" />
      <AxisGroup editor={editor} axis="y" />
      <Switch
        label="Projective (photos taken at an angle)"
        checked={draft.model === 'projective'}
        onChange={(_, data) => {
          editor.edit((d) => ({ ...d, model: data.checked ? 'projective' : 'affine' }));
        }}
      />
      <Summary evaluation={evaluation} draft={draft} />
      {(calibrated || draft.picks.some((p) => p !== null)) && (
        <Button size="small" icon={<DismissRegular />} onClick={editor.clear}>
          Clear calibration
        </Button>
      )}
    </section>
  );
}

interface AxisGroupProps {
  readonly editor: ReturnType<typeof useCalibrationEditor>;
  readonly axis: 'x' | 'y';
}

function AxisGroup({ editor, axis }: AxisGroupProps) {
  const styles = useStyles();
  const setTool = useUiStore((s) => s.setTool);
  const { draft, evaluation, active } = editor;
  const key = axis === 'x' ? 'xAxis' : 'yAxis';
  const current = draft[key];
  const name = axis.toUpperCase();
  const other = axis === 'x' ? draft.yAxis : draft.xAxis;
  const picks: readonly PickIndex[] = axis === 'x' ? [0, 1] : [2, 3];
  const crossingField: ValueField = axis === 'x' ? 'xAxisAt' : 'yAxisAt';
  const errors = evaluation.status === 'ok' ? {} : evaluation.errors;
  const showError = (field: ValueField): string | undefined =>
    draft.values[field].trim() !== '' || evaluation.status === 'invalid' ? errors[field] : undefined;
  const setAxis = (change: Partial<Axis>, coalesceKey?: string) => {
    editor.edit((d) => {
      const { unit, ...rest } = { ...d[key], ...change };
      return { ...d, [key]: unit === undefined || unit === '' ? rest : { ...rest, unit } };
    }, coalesceKey);
  };
  const setValue = (field: ValueField, text: string, coalesceKey: string) => {
    editor.edit((d) => ({ ...d, values: { ...d.values, [field]: text } }), coalesceKey);
  };
  const solved =
    evaluation.status === 'ok' && draft.values[crossingField].trim() === ''
      ? numberText(axis === 'x' ? evaluation.crossings.xAxisAt : evaluation.crossings.yAxisAt)
      : null;

  return (
    <div role="group" aria-label={`${name} axis`} className={styles.axis}>
      <div className={styles.row}>
        <TextField
          label={`${name} axis label`}
          value={current.label}
          onChange={(label, k) => {
            setAxis({ label }, k);
          }}
        />
        <TextField
          label={`${name} axis unit`}
          value={current.unit ?? ''}
          placeholder="none"
          onChange={(unit, k) => {
            setAxis({ unit }, k);
          }}
        />
      </div>
      <Field label={`${name} scale`} size="small">
        <RadioGroup
          layout="horizontal"
          value={current.type}
          onChange={(_, data) => {
            if (data.value === 'linear' || data.value === 'log10') setAxis({ type: data.value });
          }}
        >
          <Radio value="linear" label="Linear" />
          <Radio value="log10" label="Log₁₀" />
        </RadioGroup>
      </Field>
      {picks.map((i) => {
        const pick = PICKS[i];
        const px = draft.picks[i];
        return (
          <div key={pick} className={styles.pick}>
            <ToggleButton
              size="small"
              className={styles.place}
              checked={active === i}
              onClick={() => {
                editor.setActive(active === i ? null : i);
                setTool('calibrate');
              }}
            >
              {px === null ? 'Place' : 'Move'}{' '}
              <span className={styles.marker} style={{ color: PICK_COLOURS[axis] }}>
                {pick}
              </span>
            </ToggleButton>
            <TextField
              label={`${pick} value`}
              value={draft.values[VALUE_FIELDS[i]]}
              {...(px === null ? {} : { hint: `at ${px[0].toFixed(1)}, ${px[1].toFixed(1)} px` })}
              {...optional('error', showError(VALUE_FIELDS[i]))}
              onChange={(text, k) => {
                setValue(VALUE_FIELDS[i], text, k);
              }}
            />
          </div>
        );
      })}
      <TextField
        label={`${name}-axis ticks lie at ${other.label} =`}
        value={draft.values[crossingField]}
        placeholder={solved === null ? 'where the axes cross' : `${solved} (solved)`}
        hint="Leave blank to solve it from the four clicks."
        {...optional('error', showError(crossingField))}
        onChange={(text, k) => {
          setValue(crossingField, text, k);
        }}
      />
    </div>
  );
}

function optional<K extends string>(key: K, value: string | undefined): Partial<Record<K, string>> {
  return value === undefined ? {} : ({ [key]: value } as Record<K, string>);
}

function Summary({ evaluation, draft }: { evaluation: DraftEvaluation; draft: CalibrationDraft }) {
  const styles = useStyles();
  if (evaluation.status === 'incomplete') {
    return (
      <Caption1 className={styles.muted}>
        Still to place: {evaluation.missingPicks.map((i) => PICKS[i]).join(', ')}.
      </Caption1>
    );
  }
  if (evaluation.status === 'invalid') {
    return evaluation.message === undefined ? null : (
      <MessageBar intent="error">
        <MessageBarBody>{evaluation.message}</MessageBarBody>
      </MessageBar>
    );
  }
  const { calibration } = evaluation;
  const { xUnitsPerPx, yUnitsPerPx } = calibration.resolution;
  const residual = calibration.residualPx;
  return (
    <>
      <div className={styles.summary} data-testid="calibration-summary">
        <Caption1>
          Residual {residual.toFixed(3)} px (≈ {roughly(residual * xUnitsPerPx)} {unitOf(draft.xAxis)},{' '}
          {roughly(residual * yUnitsPerPx)} {unitOf(draft.yAxis)})
        </Caption1>
        <Caption1>
          Digitization resolution ≈ {roughly(xUnitsPerPx)} {unitOf(draft.xAxis)}/px, {roughly(yUnitsPerPx)}{' '}
          {unitOf(draft.yAxis)}/px
        </Caption1>
      </div>
      {calibration.warnings.map((warning) => (
        <MessageBar key={warning} intent="warning">
          <MessageBarBody>{warning}</MessageBarBody>
        </MessageBar>
      ))}
    </>
  );
}

/** Two significant digits: the summary is an order of magnitude, not a value to copy. */
const roughly = (value: number): string => String(Number(value.toPrecision(2)));

/** On log axes these are data units at the centre of the calibration points. */
function unitOf(axis: Axis): string {
  return axis.unit === undefined || axis.unit === '' ? `${axis.label} units` : axis.unit;
}
