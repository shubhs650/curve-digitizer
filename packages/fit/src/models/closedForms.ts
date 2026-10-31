import { scalar } from '../params.ts';
import type { FitData, ModelFit } from '../types.ts';
import { type ClosedForm, type FitModel, fitClosedForm, format, line } from './model.ts';

// Two-parameter laws in data units. Each starts Levenberg–Marquardt from its linearisation, which is already
// the answer when the axes make the law a straight line (a power law on log–log paper).

/**
 * The sign most y values share, and the points that have it, for the log-linear start: noise can push a few
 * points of a decay towards zero past it. Null when fewer than three points or under 80 % share the sign.
 */
function signed(data: FitData): { s: 1 | -1; x: number[]; y: number[] } | null {
  const pos = data.y.filter((y) => y > 0).length;
  const neg = data.y.filter((y) => y < 0).length;
  const s = pos >= neg ? 1 : -1;
  const keep = data.y.map((y) => s * y > 0);
  const count = s === 1 ? pos : neg;
  if (count < 3 || count < 0.8 * data.y.length) return null;
  return { s, x: data.x.filter((_, i) => keep[i]), y: data.y.filter((_, i) => keep[i]).map((y) => s * y) };
}

const powerForm: ClosedForm = {
  names: ['a', 'b'],
  f: ([a = 0, b = 0], x) => a * x ** b,
  gradient: ([a = 0, b = 0], x) => [x ** b, a * x ** b * Math.log(x)],
};

/** y = a·xᵇ, for x > 0: ln|y| = ln|a| + b·ln x over the points of the common sign gives the start. */
export const power: FitModel = {
  id: 'power',
  label: 'Power law',
  evaluate: (p, x) => (x > 0 ? scalar(p, 'a') * x ** scalar(p, 'b') : Number.NaN),
  fit(data: FitData): ModelFit | null {
    const sg = signed(data);
    if (sg === null || !data.x.every((x) => x > 0)) return null;
    const l = line(
      sg.x.map((x) => Math.log(x)),
      sg.y.map((y) => Math.log(y)),
    );
    return fitClosedForm(powerForm, data, l && [sg.s * Math.exp(l[0]), l[1]]);
  },
  form: (p) => ({ kind: 'power', a: scalar(p, 'a'), b: scalar(p, 'b') }),
  describe: (p) => `Power law y = ${format(scalar(p, 'a'))}·x^${format(scalar(p, 'b'))}`,
};

const expForm: ClosedForm = {
  names: ['a', 'b'],
  f: ([a = 0, b = 0], x) => a * Math.exp(b * x),
  gradient: ([a = 0, b = 0], x) => [Math.exp(b * x), a * x * Math.exp(b * x)],
};

/** y = a·e^(b·x): ln|y| = ln|a| + b·x over the points of the common sign gives the start. */
export const exponential: FitModel = {
  id: 'exp',
  label: 'Exponential',
  evaluate: (p, x) => scalar(p, 'a') * Math.exp(scalar(p, 'b') * x),
  fit(data: FitData): ModelFit | null {
    const sg = signed(data);
    if (sg === null) return null;
    const l = line(
      sg.x,
      sg.y.map((y) => Math.log(y)),
    );
    return fitClosedForm(expForm, data, l && [sg.s * Math.exp(l[0]), l[1]]);
  },
  form: (p) => ({ kind: 'exp', a: scalar(p, 'a'), b: scalar(p, 'b') }),
  describe: (p) => `Exponential y = ${format(scalar(p, 'a'))}·e^(${format(scalar(p, 'b'))}·x)`,
};

const logForm: ClosedForm = {
  names: ['a', 'b'],
  f: ([a = 0, b = 0], x) => a + b * Math.log(x),
  gradient: (_, x) => [1, Math.log(x)],
};

/** y = a + b·ln x, for x > 0: linear in (a, b), so the line through (ln x, y) is the start. */
export const logarithmic: FitModel = {
  id: 'log',
  label: 'Logarithmic',
  evaluate: (p, x) => (x > 0 ? scalar(p, 'a') + scalar(p, 'b') * Math.log(x) : Number.NaN),
  fit(data: FitData): ModelFit | null {
    if (!data.x.every((x) => x > 0)) return null;
    return fitClosedForm(
      logForm,
      data,
      line(
        data.x.map((x) => Math.log(x)),
        data.y,
      ),
    );
  },
  form: (p) => ({ kind: 'log', a: scalar(p, 'a'), b: scalar(p, 'b') }),
  describe: (p) => `Logarithmic y = ${format(scalar(p, 'a'))} + ${format(scalar(p, 'b'))}·ln x`,
};
