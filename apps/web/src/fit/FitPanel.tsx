import { type Dataset, type Graph, setDatasetFit } from '@cd/core';
import { type FitResult, isModelId, MAX_DEGREE, type ModelId, type ModelSpec, MODELS } from '@cd/fit';
import {
  Badge,
  Button,
  Caption1,
  Field,
  Input,
  makeStyles,
  ProgressBar,
  Radio,
  RadioGroup,
  Select,
  tokens,
} from '@fluentui/react-components';
import { useId, useMemo, useState } from 'react';
import { useDispatch } from '../session/context';
import { useUiStore } from '../ui/uiStore';
import { fitBlock, fitInputs, isStale, toStoredFit } from './fitInputs';
import { type FitSession, useFitSession, useFitStore } from './fitStore';
import { ResidualPlot } from './ResidualPlot';
import { cancelFit, clearFit, runFit } from './runFit';

const useStyles = makeStyles({
  panel: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 2fr)',
    gap: tokens.spacingHorizontalM,
    height: '100%',
    minHeight: 0,
    paddingInline: tokens.spacingHorizontalM,
    paddingBottom: tokens.spacingVerticalS,
    boxSizing: 'border-box',
  },
  left: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    minHeight: 0,
    overflowY: 'auto',
  },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: tokens.spacingHorizontalS },
  grow: { flexGrow: 1 },
  narrow: { width: '7em' },
  muted: { color: tokens.colorNeutralForeground3 },
  error: { color: tokens.colorPaletteRedForeground1 },
  warning: { color: tokens.colorPaletteDarkOrangeForeground1 },
  plot: { minHeight: 0, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXXS },
  empty: { paddingInline: tokens.spacingHorizontalM, color: tokens.colorNeutralForeground3 },
});

/** How many candidates the panel lists (PRD §4.8: "shows top 3"). */
export const SHOWN_CANDIDATES = 3;

const MODEL_ORDER: readonly ModelId[] = [
  'poly',
  'power',
  'exp',
  'log',
  'rational',
  'spline',
  'pchip',
  'piecewise',
];

/** The registry's description of a fit, or its raw model id when the model is unknown to this version. */
export function describeFit(fit: Pick<FitResult, 'params'> & { readonly model: string }): string {
  return isModelId(fit.model) ? MODELS[fit.model].describe(fit.params) : fit.model;
}

const fmt = (v: number, digits = 4) => (Number.isFinite(v) ? String(Number(v.toPrecision(digits))) : '—');

/** "R² 0.9987 · RMSE 0.12 · AICc −120.4", RMSE in the fit's y space. */
export function statsText(fit: Pick<FitResult, 'stats' | 'space'>): string {
  const rmse =
    fit.space.y === 'log' ? `RMSE ${fmt(fit.stats.rmse, 3)} (log10)` : `RMSE ${fmt(fit.stats.rmse, 3)}`;
  return `R² ${fmt(fit.stats.r2, 6)} · ${rmse} · AICc ${fit.stats.aicc.toFixed(1)}`;
}

/**
 * The candidates the panel lists: the recommended fit first, then the lowest-AICc others up to three, each with
 * its index in the result.
 */
export function shownCandidates(fits: readonly FitResult[], recommended: number): number[] {
  const order = recommended >= 0 ? [recommended] : [];
  for (let i = 0; i < fits.length && order.length < SHOWN_CANDIDATES; i++)
    if (i !== recommended) order.push(i);
  return order;
}

/** A model spec from the picker's text fields; null when a field does not parse. */
export function specFrom(model: ModelId, option: string): ModelSpec | null {
  const t = option.trim();
  switch (model) {
    case 'poly': {
      const degree = Number(t || '3');
      return Number.isInteger(degree) && degree >= 1 && degree <= MAX_DEGREE ? { model, degree } : null;
    }
    case 'rational': {
      const m = /^(\d)\s*\/\s*(\d)$/.exec(t || '1/1');
      return m ? { model, num: Number(m[1]), den: Number(m[2]) } : null;
    }
    case 'spline':
    case 'pchip': {
      if (t === '' || t.toLowerCase() === 'auto') return { model, knots: 'auto' };
      const k = Number(t);
      return Number.isInteger(k) && k >= 3 ? { model, knots: k } : null;
    }
    case 'piecewise': {
      if (t === '' || t.toLowerCase() === 'auto') return { model, breakpoints: 'auto' };
      const values = t.split(/[\s,;]+/).map(Number);
      return values.every(Number.isFinite) ? { model, breakpoints: values } : null;
    }
    default:
      return { model };
  }
}

const OPTION_LABEL: Partial<Record<ModelId, { label: string; hint: string }>> = {
  poly: { label: 'Degree', hint: '1–9' },
  rational: { label: 'Order', hint: 'e.g. 2/1' },
  spline: { label: 'Knots', hint: 'auto or a count' },
  pchip: { label: 'Knots', hint: 'auto or a count' },
  piecewise: { label: 'Breakpoints (x)', hint: 'auto or x values' },
};

/** The fit panel in the bottom dock (task 3.2, PRD §4.8). */
export function FitPanel({ graph, dataset }: { readonly graph: Graph; readonly dataset: Dataset | null }) {
  const styles = useStyles();
  const blocked = fitBlock(graph, dataset);
  if (blocked !== null || dataset === null) {
    return (
      <div className={styles.row}>
        <span className={styles.empty}>
          <DatasetPicker graph={graph} dataset={dataset} />
        </span>
        <Caption1 role="note" className={styles.muted}>
          {blocked}
        </Caption1>
      </div>
    );
  }
  return <FitWorkspace graph={graph} dataset={dataset} />;
}

/** Chooses the active dataset when the graph has more than one. */
function DatasetPicker({ graph, dataset }: { readonly graph: Graph; readonly dataset: Dataset | null }) {
  const id = useId();
  const setActiveDataset = useUiStore((s) => s.setActiveDataset);
  if (dataset === null || graph.datasets.length < 2) return null;
  return (
    <>
      <label htmlFor={id}>
        <Caption1>Dataset</Caption1>
      </label>{' '}
      <Select
        id={id}
        size="small"
        value={dataset.id}
        onChange={(_, d) => {
          setActiveDataset(graph.id, d.value);
        }}
      >
        {graph.datasets.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </Select>
    </>
  );
}

function FitWorkspace({ graph, dataset }: { readonly graph: Graph; readonly dataset: Dataset }) {
  const styles = useStyles();
  const dispatch = useDispatch();
  const session = useFitSession(graph.id, dataset.id);
  const setSession = useFitStore((s) => s.setSession);
  const inputs = useMemo(() => fitInputs(graph, dataset), [graph, dataset]);
  const stored = graph.fits.find((f) => f.datasetId === dataset.id) ?? null;
  const [model, setModel] = useState<ModelId>('poly');
  const [option, setOption] = useState('');
  const modelId = useId();
  const optionId = useId();
  const spec = specFrom(model, option);
  const optionLabel = OPTION_LABEL[model];

  // The residual plot follows the previewed candidate, else the dataset's accepted fit.
  const shown = session?.result?.fits[session.previewIndex] ?? stored;

  const accept = (s: FitSession, index: number) => {
    const fit = s.result?.fits[index];
    if (fit === undefined) return;
    const recommended = s.spec === undefined && index === s.result?.recommended;
    if (
      dispatch(
        setDatasetFit(graph.id, dataset.id, toStoredFit(fit, dataset.id, crypto.randomUUID(), recommended)),
      )
    ) {
      clearFit();
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.left}>
        <div className={styles.row}>
          <DatasetPicker graph={graph} dataset={dataset} />
          <Caption1 className={styles.muted}>
            {inputs.x.length} points
            {inputs.excluded.length > 0 && `, ${String(inputs.excluded.length)} excluded from fits`}
            {inputs.space.x === 'log' || inputs.space.y === 'log' ? ' · fitted on the log axes' : ''}
          </Caption1>
        </div>
        <div className={styles.row}>
          <Button
            size="small"
            appearance="primary"
            disabled={session?.running === true}
            onClick={() => {
              void runFit(graph.id, dataset.id, inputs);
            }}
          >
            Recommend fits
          </Button>
          <label htmlFor={modelId}>
            <Caption1>Model</Caption1>
          </label>
          <Select
            id={modelId}
            size="small"
            value={model}
            onChange={(_, d) => {
              setModel(d.value as ModelId);
              setOption('');
            }}
          >
            {MODEL_ORDER.map((id) => (
              <option key={id} value={id}>
                {MODELS[id].label}
              </option>
            ))}
          </Select>
          {optionLabel && (
            <>
              <label htmlFor={optionId}>
                <Caption1>{optionLabel.label}</Caption1>
              </label>
              <Input
                id={optionId}
                size="small"
                className={styles.narrow}
                placeholder={optionLabel.hint}
                value={option}
                onChange={(_, d) => {
                  setOption(d.value);
                }}
              />
            </>
          )}
          <Button
            size="small"
            disabled={spec === null || session?.running === true}
            onClick={() => {
              if (spec !== null) void runFit(graph.id, dataset.id, inputs, spec);
            }}
          >
            Fit model
          </Button>
        </div>
        {session?.running === true && (
          <div className={styles.row}>
            <Field label="Fitting" size="small" className={styles.grow}>
              <ProgressBar value={session.fraction} max={1} />
            </Field>
            <Button size="small" onClick={cancelFit}>
              Cancel
            </Button>
          </div>
        )}
        {session?.error != null && (
          <Caption1 role="alert" className={styles.error}>
            {session.error}
          </Caption1>
        )}
        {session?.result != null && session.result.fits.length > 0 && (
          <Candidates
            session={session}
            onPreview={(index) => {
              setSession((s) => (s ? { ...s, previewIndex: index } : s));
            }}
            onAccept={(index) => {
              accept(session, index);
            }}
            onDiscard={clearFit}
          />
        )}
        {stored !== null && (
          <div role="status" aria-label="Current fit">
            <Caption1>
              <strong>Current fit:</strong> {describeFit(stored)} · {statsText(stored)} · x from{' '}
              {fmt(stored.domain[0])} to {fmt(stored.domain[1])}
              {stored.recommended && ' · recommended'}
            </Caption1>
            {isStale(stored, inputs) && (
              <Caption1 className={styles.warning} role="alert">
                {' '}
                The points changed since this fit; fit again to update it.
              </Caption1>
            )}{' '}
            <Button
              size="small"
              appearance="subtle"
              onClick={() => {
                dispatch(setDatasetFit(graph.id, dataset.id, null));
              }}
            >
              Remove fit
            </Button>
          </div>
        )}
      </div>
      <div className={styles.plot}>
        {shown !== null ? (
          <>
            <Caption1 className={styles.muted}>Residuals: {describeFit(shown)}</Caption1>
            <ResidualPlot fit={shown} inputs={inputs} color={dataset.color} label={describeFit(shown)} />
          </>
        ) : (
          <Caption1 className={styles.muted}>Residuals appear here once there is a fit.</Caption1>
        )}
      </div>
    </div>
  );
}

function Candidates({
  session,
  onPreview,
  onAccept,
  onDiscard,
}: {
  readonly session: FitSession;
  readonly onPreview: (index: number) => void;
  readonly onAccept: (index: number) => void;
  readonly onDiscard: () => void;
}) {
  const styles = useStyles();
  const result = session.result;
  if (result === null) return null;
  const best = result.fits[0]?.stats.aicc ?? 0;
  const indices = shownCandidates(result.fits, result.recommended);
  return (
    <>
      <RadioGroup
        aria-label={session.spec === undefined ? 'Recommended fits' : 'Fitted model'}
        value={String(session.previewIndex)}
        onChange={(_, d) => {
          onPreview(Number(d.value));
        }}
      >
        {indices.map((i) => {
          const fit = result.fits[i];
          if (fit === undefined) return null;
          return (
            <Radio
              key={i}
              value={String(i)}
              label={
                <span>
                  {describeFit(fit)}{' '}
                  {i === result.recommended && session.spec === undefined && (
                    <Badge size="small" appearance="tint" color="brand">
                      Recommended
                    </Badge>
                  )}{' '}
                  {fit.warnings.includes('oscillation') && (
                    <Badge size="small" appearance="tint" color="warning">
                      Oscillates
                    </Badge>
                  )}
                  <br />
                  <Caption1 className={styles.muted}>
                    {statsText(fit)}
                    {session.spec === undefined && ` · ΔAICc ${(fit.stats.aicc - best).toFixed(1)}`}
                  </Caption1>
                </span>
              }
            />
          );
        })}
      </RadioGroup>
      <div className={styles.row}>
        <Button
          size="small"
          appearance="primary"
          onClick={() => {
            onAccept(session.previewIndex);
          }}
        >
          Use this fit
        </Button>
        <Button size="small" onClick={onDiscard}>
          Discard
        </Button>
      </div>
    </>
  );
}
