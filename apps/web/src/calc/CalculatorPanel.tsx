import type { Graph } from '@cd/core';
import {
  Button,
  Caption1,
  Checkbox,
  Field,
  Input,
  makeStyles,
  Select,
  tokens,
} from '@fluentui/react-components';
import { CopyRegular } from '@fluentui/react-icons';
import { useId, useMemo } from 'react';
import { useNotify } from '../ui/notices';
import { type CalcValue, calcTsv, calculate, compare, parseXs } from './calculator';
import { useCalcStore } from './calcStore';

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalS,
    height: '100%',
    boxSizing: 'border-box',
    overflow: 'auto',
  },
  bar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: tokens.spacingHorizontalM,
  },
  xs: {
    minWidth: '240px',
    flexGrow: 1,
    maxWidth: '480px',
  },
  compare: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  table: {
    borderCollapse: 'collapse',
    fontVariantNumeric: 'tabular-nums',
    fontSize: tokens.fontSizeBase200,
  },
  th: {
    textAlign: 'right',
    fontWeight: tokens.fontWeightSemibold,
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalM}`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    whiteSpace: 'nowrap',
  },
  td: {
    textAlign: 'right',
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalM}`,
    borderBottom: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke3}`,
    whiteSpace: 'nowrap',
  },
  swatch: {
    display: 'inline-block',
    width: '10px',
    height: '10px',
    borderRadius: '2px',
    marginRight: tokens.spacingHorizontalXS,
  },
  muted: {
    color: tokens.colorNeutralForeground3,
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
  },
});

const fmt = (v: number | null) =>
  v === null || !Number.isFinite(v) ? '—' : String(Number(v.toPrecision(6)));

function valueText(value: CalcValue | null): string {
  if (value === null) return '—';
  return `${fmt(value.y)}${value.extrapolated ? '*' : ''}`;
}

/**
 * The interpolation calculator (PRD §4.10, task 3.5): type X values, read Y for every function dataset of the
 * graph, from its fit or between its points, and optionally A − B and A / B for two of them. Copyable.
 */
export function CalculatorPanel({ graph }: { readonly graph: Graph }) {
  const styles = useStyles();
  const notify = useNotify();
  const text = useCalcStore((s) => s.text);
  const setText = useCalcStore((s) => s.setText);
  const comparing = useCalcStore((s) => s.compare);
  const setCompare = useCalcStore((s) => s.setCompare);
  const aId = useId();
  const bId = useId();

  const parsed = useMemo(() => parseXs(text), [text]);
  const xs = 'xs' in parsed ? parsed.xs : [];
  const columns = useMemo(() => calculate(graph, xs), [graph, xs]);
  const ids = columns.map((c) => c.dataset.id);
  // The comparison only stands while both datasets are still function datasets of this graph.
  const pair =
    comparing && ids.includes(comparing[0]) && ids.includes(comparing[1])
      ? { a: ids.indexOf(comparing[0]), b: ids.indexOf(comparing[1]) }
      : null;
  const a = pair ? columns[pair.a] : undefined;
  const b = pair ? columns[pair.b] : undefined;
  const xUnit = graph.calibration?.xAxis.unit ?? '';
  const anyExtrapolated = columns.some((c) => c.values.some((v) => v?.extrapolated));

  if (graph.calibration === null) {
    return (
      <div className={styles.panel}>
        <Caption1 role="note">Calibrate the graph first: the calculator works in calibrated values.</Caption1>
      </div>
    );
  }
  if (columns.length === 0) {
    return (
      <div className={styles.panel}>
        <Caption1 role="note">Add a function dataset with points (or a fit) to read values from it.</Caption1>
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(calcTsv(graph, xs, columns, pair));
      notify({ intent: 'success', title: `Copied ${String(xs.length)} ${xs.length === 1 ? 'row' : 'rows'}` });
    } catch (error) {
      notify({
        intent: 'error',
        title: 'Could not copy the results',
        body: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div className={styles.panel}>
      <div className={styles.bar}>
        <Field
          className={styles.xs}
          size="small"
          label={`X values${xUnit ? ` (${xUnit})` : ''}`}
          hint="Separate several with commas or spaces."
          validationState={'error' in parsed ? 'error' : 'none'}
          validationMessage={'error' in parsed ? parsed.error : null}
        >
          <Input
            size="small"
            value={text}
            placeholder="e.g. 50, 100, 150"
            onChange={(_, data) => {
              setText(data.value);
            }}
          />
        </Field>
        <div className={styles.compare}>
          <Checkbox
            label="Compare"
            checked={pair !== null}
            disabled={columns.length < 2}
            onChange={(_, data) => {
              setCompare(data.checked === true ? [ids[0] ?? '', ids[1] ?? ''] : null);
            }}
          />
          {pair !== null && (
            <>
              <label htmlFor={aId}>
                <Caption1>A</Caption1>
              </label>
              <Select
                id={aId}
                size="small"
                value={ids[pair.a]}
                onChange={(_, data) => {
                  setCompare([data.value, ids[pair.b] ?? '']);
                }}
              >
                {columns.map((c) => (
                  <option key={c.dataset.id} value={c.dataset.id}>
                    {c.dataset.name}
                  </option>
                ))}
              </Select>
              <label htmlFor={bId}>
                <Caption1>B</Caption1>
              </label>
              <Select
                id={bId}
                size="small"
                value={ids[pair.b]}
                onChange={(_, data) => {
                  setCompare([ids[pair.a] ?? '', data.value]);
                }}
              >
                {columns.map((c) => (
                  <option key={c.dataset.id} value={c.dataset.id}>
                    {c.dataset.name}
                  </option>
                ))}
              </Select>
            </>
          )}
        </div>
        <Button size="small" icon={<CopyRegular />} disabled={xs.length === 0} onClick={() => void copy()}>
          Copy results
        </Button>
      </div>
      {xs.length === 0 ? (
        <Caption1 className={styles.muted}>
          Type X values to read Y for every dataset: from its fit when it has one, else along straight lines
          between its points.
        </Caption1>
      ) : (
        <>
          <table className={styles.table} aria-label="Calculated values">
            <thead>
              <tr>
                <th scope="col" className={styles.th}>
                  X{xUnit ? ` (${xUnit})` : ''}
                </th>
                {columns.map((c) => {
                  const fitted = graph.fits.some((f) => f.datasetId === c.dataset.id);
                  return (
                    <th key={c.dataset.id} scope="col" className={styles.th}>
                      <span
                        className={styles.swatch}
                        style={{ backgroundColor: c.dataset.color }}
                        aria-hidden
                      />
                      {c.dataset.name}
                      {c.dataset.yUnit ? ` (${c.dataset.yUnit})` : ''}
                      <span className={styles.muted}> · {fitted ? 'fit' : 'points'}</span>
                    </th>
                  );
                })}
                {a && b && (
                  <>
                    <th scope="col" className={styles.th}>
                      {a.dataset.name} − {b.dataset.name}
                    </th>
                    <th scope="col" className={styles.th}>
                      {a.dataset.name} / {b.dataset.name}
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {xs.map((x, i) => {
                const diff = a && b ? compare(a.values[i] ?? null, b.values[i] ?? null) : null;
                return (
                  // X values may repeat, so the row index is part of the key.
                  <tr key={`${String(i)}:${String(x)}`}>
                    <th scope="row" className={styles.td}>
                      {fmt(x)}
                    </th>
                    {columns.map((c) => (
                      <td key={c.dataset.id} className={styles.td}>
                        {valueText(c.values[i] ?? null)}
                      </td>
                    ))}
                    {diff && (
                      <>
                        <td className={styles.td}>{fmt(diff.difference)}</td>
                        <td className={styles.td}>{fmt(diff.ratio)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Caption1 className={styles.muted}>
            — means no value: outside the points of a dataset without a fit, or where its fit is undefined.
            {anyExtrapolated && ' * outside the X range the fit was made from (extrapolated).'}
          </Caption1>
        </>
      )}
    </div>
  );
}
