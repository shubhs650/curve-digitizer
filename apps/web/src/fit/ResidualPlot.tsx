import type { Fit } from '@cd/core';
import { toSpace } from '@cd/fit';
import { makeStyles, tokens } from '@fluentui/react-components';
import { type FitInputs, residual } from './fitInputs';

const useStyles = makeStyles({
  svg: {
    display: 'block',
    width: '100%',
    height: '100%',
    minHeight: '100px',
    backgroundColor: tokens.colorNeutralBackground1,
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  zero: { stroke: tokens.colorNeutralStroke1, strokeWidth: 1 },
  label: { fill: tokens.colorNeutralForeground3, fontSize: '10px' },
});

const W = 400;
const H = 140;
const PAD = 8;

/**
 * Residuals of a fit against x (task 3.2): y − f(x) in fit space, so log10(y / f(x)) on a log y axis and against
 * log10 x on a log x axis, where the fit was made. Points excluded from the fit are drawn hollow.
 */
export function ResidualPlot({
  fit,
  inputs,
  color,
  label,
}: {
  readonly fit: Pick<Fit, 'model' | 'params' | 'space' | 'domain'>;
  readonly inputs: FitInputs;
  readonly color: string;
  readonly label: string;
}) {
  const styles = useStyles();
  const toPoint = ([x, y]: readonly [number, number]) => ({
    u: toSpace(x, fit.space.x),
    r: residual(fit, [x, y]),
  });
  const used = inputs.x.map((x, i) => toPoint([x, inputs.y[i] ?? Number.NaN]));
  const left = inputs.excluded.map(toPoint);
  const all = [...used, ...left].filter((p) => Number.isFinite(p.u) && Number.isFinite(p.r));
  const uMin = Math.min(...all.map((p) => p.u));
  const uMax = Math.max(...all.map((p) => p.u));
  const rMax = Math.max(...all.map((p) => Math.abs(p.r)), 1e-300);
  const sx = (u: number) => PAD + ((u - uMin) / (uMax - uMin || 1)) * (W - 2 * PAD);
  const sy = (r: number) => H / 2 - (r / rMax) * (H / 2 - PAD);
  const unit = fit.space.y === 'log' ? 'log10(y / fit)' : 'y − fit';

  return (
    <svg
      className={styles.svg}
      viewBox={`0 0 ${String(W)} ${String(H)}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`Residuals of ${label}: ${String(used.length)} points, largest ${rMax.toPrecision(3)} (${unit})`}
    >
      <line className={styles.zero} x1={PAD} x2={W - PAD} y1={H / 2} y2={H / 2} />
      <text className={styles.label} x={PAD} y={PAD + 8}>
        +{rMax.toPrecision(3)} ({unit})
      </text>
      {used
        .filter((p) => Number.isFinite(p.r))
        .map((p, i) => (
          <circle key={`u${String(i)}`} data-residual="used" cx={sx(p.u)} cy={sy(p.r)} r={2.5} fill={color} />
        ))}
      {left
        .filter((p) => Number.isFinite(p.r))
        .map((p, i) => (
          <circle
            key={`e${String(i)}`}
            data-residual="excluded"
            cx={sx(p.u)}
            cy={sy(p.r)}
            r={2.5}
            fill="none"
            stroke={tokens.colorNeutralForeground3}
          />
        ))}
    </svg>
  );
}
