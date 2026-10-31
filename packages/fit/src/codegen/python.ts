import type { EmitContext } from './languages.ts';
import { group, horner, literal, operand, plusTerm, wrapItems } from './text.ts';

const I = '    ';

function array(name: string, values: readonly number[]): string[] {
  const lines = wrapItems(
    values.map((v) => literal(v)),
    88,
  );
  if (lines.length === 1) return [`${I}${name} = np.array([${lines[0] ?? ''}])`];
  return [`${I}${name} = np.array([`, ...lines.map((l) => `${I}${I}${l}`), `${I}])`];
}

/** Python with NumPy: vectorised, so `f(2.0)` and `f(np.array([...]))` both work. */
export function python({ fit, form, name, header }: EmitContext): string {
  const lit = (n: number) => literal(n);
  const body: string[] = [`${I}x = np.asarray(x, dtype=float)`];
  const positive = `${I}x = np.where(x > 0, x, np.nan)`;
  if (form.kind === 'power') body.push(positive, `${I}return ${lit(form.a)} * x ** ${operand(lit(form.b))}`);
  else if (form.kind === 'exp') body.push(`${I}return ${lit(form.a)} * np.exp(${lit(form.b)} * x)`);
  else if (form.kind === 'log')
    body.push(positive, `${I}return ${plusTerm(lit(form.a), form.b, 'np.log(x)', lit)}`);
  else {
    body.push(fit.space.x === 'log' ? `${I}u = np.log10(np.where(x > 0, x, np.nan))` : `${I}u = x`);
    if (form.kind === 'poly') body.push(`${I}v = ${horner(form.c.map(lit), 'u')}`);
    else if (form.kind === 'rational')
      body.push(
        `${I}v = ${group(horner(form.p.map(lit), 'u'))} / (1 + u * ${group(horner(form.q.map(lit), 'u'))})`,
      );
    else {
      body.push(...array('knots', form.knots), ...array('values', form.values));
      if (form.kind === 'hermite') body.push(...array('slopes', form.slopes));
      body.push(
        `${I}# Interval i holds u (the end intervals continue outside the knots)`,
        `${I}i = np.clip(np.searchsorted(knots, u, side="right") - 1, 0, len(knots) - 2)`,
      );
      if (form.kind === 'hermite')
        body.push(
          `${I}h = knots[i + 1] - knots[i]`,
          `${I}s = (u - knots[i]) / h`,
          `${I}s2 = s * s`,
          `${I}s3 = s2 * s`,
          `${I}v = ((2 * s3 - 3 * s2 + 1) * values[i] + (s3 - 2 * s2 + s) * h * slopes[i]`,
          `${I}     + (-2 * s3 + 3 * s2) * values[i + 1] + (s3 - s2) * h * slopes[i + 1])`,
        );
      else
        body.push(
          `${I}s = (u - knots[i]) / (knots[i + 1] - knots[i])`,
          `${I}v = values[i] + s * (values[i + 1] - values[i])`,
        );
    }
    body.push(fit.space.y === 'log' ? `${I}return 10.0 ** v` : `${I}return v`);
  }
  return [
    ...header.map((l) => `# ${l}`),
    'import numpy as np',
    '',
    '',
    `def ${name}(x):`,
    `${I}"""y at x, for a number or a NumPy array of x values."""`,
    ...body,
    '',
  ].join('\n');
}
