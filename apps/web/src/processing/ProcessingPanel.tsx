import { type FilterStep, type Graph, setProcessing } from '@cd/core';
import { enhanceForTracing, type FilterOpName, isFilterOpName, parseHexColor, toHexColor } from '@cd/image';
import {
  Button,
  Caption1,
  Caption1Strong,
  Field,
  makeStyles,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Slider,
  SpinButton,
  Switch,
  tokens,
} from '@fluentui/react-components';
import {
  AddRegular,
  ArrowDownRegular,
  ArrowUpRegular,
  DeleteRegular,
  SparkleRegular,
} from '@fluentui/react-icons';
import { useId } from 'react';
import { useDispatch } from '../session/context';
import { useUiStore } from '../ui/uiStore';
import { useDarkBackground } from './darkBackground';
import {
  hasInvert,
  insertStep,
  MENU_OPS,
  moveStep,
  newStep,
  opLabel,
  removeStep,
  stepProblem,
  updateStep,
} from './steps';
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
  actions: { display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalS },
  list: {
    listStyleType: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  step: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingVerticalXS,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    '& .fui-Field, & .fui-Slider, & .fui-SpinButton': { minWidth: 0 },
  },
  stepHeader: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
  stepTitle: { flexGrow: 1 },
  hint: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: tokens.spacingVerticalXS,
    padding: tokens.spacingVerticalS,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  error: { color: tokens.colorPaletteRedForeground1 },
  color: { width: '48px', height: '28px', padding: 0, border: 'none', backgroundColor: 'transparent' },
});

/** The pre-processing stack of a graph (task 2.2, PRD §4.6): add, edit, reorder, remove, preset, preview. */
export function ProcessingPanel({ graph }: { graph: Graph }) {
  const styles = useStyles();
  const dispatch = useDispatch();
  const showProcessed = useUiStore((s) => s.showProcessed);
  const setShowProcessed = useUiStore((s) => s.setShowProcessed);
  const dark = useDarkBackground(graph);
  const stack = graph.processing;

  const commit = (next: readonly FilterStep[], label: string, coalesceKey?: string) => {
    dispatch(setProcessing(graph.id, next, label, coalesceKey));
  };

  return (
    <section aria-labelledby="processing-heading" className={styles.panel}>
      <PanelTitle id="processing-heading">Pre-processing</PanelTitle>
      <Caption1 className={styles.muted}>
        Filters clean the image for the tracers. Points are always shown on the original image.
      </Caption1>
      {dark && !hasInvert(stack) && (
        <div role="status" className={styles.hint} data-testid="dark-background-hint">
          <Caption1>
            This chart has a dark background. The tracers work best on dark lines on light paper.
          </Caption1>
          <Button
            size="small"
            onClick={() => {
              commit(insertStep(stack, newStep('invert')), 'Add Invert');
            }}
          >
            Add Invert
          </Button>
        </div>
      )}
      <div className={styles.actions}>
        <Button
          size="small"
          icon={<SparkleRegular />}
          onClick={() => {
            commit(enhanceForTracing(graph.image.width, graph.image.height), 'Enhance for tracing');
            setShowProcessed(true);
          }}
        >
          Enhance for tracing
        </Button>
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button size="small" icon={<AddRegular />}>
              Add filter
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {MENU_OPS.map((op) => (
                <MenuItem
                  key={op}
                  onClick={() => {
                    commit(insertStep(stack, newStep(op)), `Add ${opLabel(op)}`);
                  }}
                >
                  {opLabel(op)}
                </MenuItem>
              ))}
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>
      <Switch
        label="Show processed image"
        checked={showProcessed}
        onChange={(_, data) => {
          setShowProcessed(data.checked);
        }}
      />
      {stack.length === 0 ? (
        <Caption1 className={styles.muted}>No filters: the tracers read the original image.</Caption1>
      ) : (
        <ol aria-label="Filters, applied top to bottom" className={styles.list}>
          {stack.map((step, index) => (
            <StepItem
              key={index}
              graphId={graph.id}
              step={step}
              index={index}
              count={stack.length}
              onMove={(delta) => {
                commit(moveStep(stack, index, delta), `Move ${opLabel(step.op)}`);
              }}
              onRemove={() => {
                commit(removeStep(stack, index), `Remove ${opLabel(step.op)}`);
              }}
              onChange={(patch, key) => {
                commit(updateStep(stack, index, patch), `Change ${opLabel(step.op)}`, key);
              }}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

interface StepItemProps {
  readonly graphId: string;
  readonly step: FilterStep;
  readonly index: number;
  readonly count: number;
  readonly onMove: (delta: number) => void;
  readonly onRemove: () => void;
  readonly onChange: (patch: Readonly<Record<string, unknown>>, coalesceKey: string) => void;
}

function StepItem({ graphId, step, index, count, onMove, onRemove, onChange }: StepItemProps) {
  const styles = useStyles();
  const label = opLabel(step.op);
  const problem = stepProblem(step);
  const key = (param: string) => `processing:${graphId}:${String(index)}:${param}`;
  return (
    <li className={styles.step} aria-label={`${String(index + 1)}. ${label}`}>
      <div className={styles.stepHeader}>
        <Caption1Strong className={styles.stepTitle}>
          {index + 1}. {label}
        </Caption1Strong>
        <Button
          size="small"
          appearance="subtle"
          icon={<ArrowUpRegular />}
          aria-label={`Move ${label} up`}
          disabled={index === 0}
          onClick={() => {
            onMove(-1);
          }}
        />
        <Button
          size="small"
          appearance="subtle"
          icon={<ArrowDownRegular />}
          aria-label={`Move ${label} down`}
          disabled={index === count - 1}
          onClick={() => {
            onMove(1);
          }}
        />
        <Button
          size="small"
          appearance="subtle"
          icon={<DeleteRegular />}
          aria-label={`Remove ${label}`}
          onClick={onRemove}
        />
      </div>
      {problem !== null ? (
        <Caption1 className={styles.error}>Skipped: {problem}.</Caption1>
      ) : (
        isFilterOpName(step.op) && <StepParams op={step.op} step={step} onChange={onChange} paramKey={key} />
      )}
    </li>
  );
}

interface StepParamsProps {
  readonly op: FilterOpName;
  readonly step: FilterStep;
  readonly onChange: (patch: Readonly<Record<string, unknown>>, coalesceKey: string) => void;
  readonly paramKey: (param: string) => string;
}

const num = (step: FilterStep, k: string, fallback: number): number => {
  const v = step[k];
  return typeof v === 'number' ? v : fallback;
};

function StepParams({ op, step, onChange, paramKey }: StepParamsProps) {
  const slider = (
    param: string,
    label: string,
    min: number,
    max: number,
    stepSize: number,
    fallback: number,
  ) => (
    <ParamSlider
      label={label}
      min={min}
      max={max}
      step={stepSize}
      value={num(step, param, fallback)}
      onChange={(value) => {
        onChange({ [param]: value }, paramKey(param));
      }}
    />
  );
  const spin = (param: string, label: string, min: number, max: number, fallback: number) => (
    <ParamSpin
      label={label}
      min={min}
      max={max}
      value={num(step, param, fallback)}
      onChange={(value) => {
        onChange({ [param]: value }, paramKey(param));
      }}
    />
  );
  switch (op) {
    case 'brightness':
      return slider('value', 'Amount', -1, 1, 0.05, 0);
    case 'contrast':
      return (
        <>
          {slider('value', 'Factor', 0, 3, 0.05, 1)}
          <Switch
            label="Auto stretch"
            checked={step.auto === true}
            onChange={(_, data) => {
              onChange({ auto: data.checked }, paramKey('auto'));
            }}
          />
        </>
      );
    case 'threshold': {
      const auto = typeof step.level !== 'number';
      return (
        <>
          <Switch
            label="Automatic level"
            checked={auto}
            onChange={(_, data) => {
              onChange({ level: data.checked ? null : 0.5 }, paramKey('level'));
            }}
          />
          {!auto && slider('level', 'Darkness level', 0, 1, 0.01, 0.5)}
        </>
      );
    }
    case 'despeckle':
      return spin('radius', 'Radius (px)', 1, 5, 1);
    case 'gridSuppress':
      return (
        <>
          {spin('minRunPx', 'Minimum run (px)', 10, 100_000, 200)}
          {spin('tolerance', 'Tolerance (px)', 0, 10, 2)}
        </>
      );
    case 'isolateColor':
      return (
        <>
          <ColorField
            label="Colour"
            value={typeof step.color === 'string' ? step.color : '#000000'}
            onChange={(color) => {
              onChange({ color }, paramKey('color'));
            }}
          />
          {slider('tolerance', 'Tolerance (ΔE)', 0, 100, 1, 25)}
        </>
      );
    case 'grayscale':
    case 'invert':
      return null;
  }
}

function ParamSlider(props: {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly onChange: (value: number) => void;
}) {
  return (
    <Field label={`${props.label}: ${String(props.value)}`} size="small">
      <Slider
        size="small"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(_, data) => {
          props.onChange(data.value);
        }}
      />
    </Field>
  );
}

function ParamSpin(props: {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly value: number;
  readonly onChange: (value: number) => void;
}) {
  return (
    <Field label={props.label} size="small">
      <SpinButton
        size="small"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(_, data) => {
          const value = data.value ?? (data.displayValue === undefined ? null : Number(data.displayValue));
          if (value !== null && Number.isFinite(value)) {
            props.onChange(Math.max(props.min, Math.min(props.max, Math.round(value))));
          }
        }}
      />
    </Field>
  );
}

function ColorField(props: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  const styles = useStyles();
  const id = useId();
  return (
    <Field label={{ children: props.label, htmlFor: id }} size="small">
      <input
        id={id}
        type="color"
        className={styles.color}
        value={props.value}
        onChange={(event) => {
          const rgb = parseHexColor(event.target.value);
          if (rgb) props.onChange(toHexColor(rgb));
        }}
      />
    </Field>
  );
}
