import type { EmitContext } from './languages.ts';
import { group, horner, literal, plusTerm, wrapItems } from './text.ts';

const I = '    ';

/** A double literal: `2` would be an int, harmless here but misleading in a table of doubles. */
function lit(value: number): string {
  const text = literal(value);
  return /^-?\d+$/.test(text) ? `${text}.0` : text;
}

function array(name: string, values: readonly number[]): string[] {
  const lines = wrapItems(values.map(lit), 88);
  if (lines.length === 1) return [`${I}static const double ${name}[] = {${lines[0] ?? ''}};`];
  return [`${I}static const double ${name}[] = {`, ...lines.map((l) => `${I}${I}${l}`), `${I}};`];
}

/** C99 (and C++): `double name(double x)` with <math.h>; NAN where the fit is undefined. */
export function c({ fit, form, name, header }: EmitContext): string {
  const body: string[] = [];
  if (form.kind === 'power') body.push(`${I}return x > 0.0 ? ${lit(form.a)} * pow(x, ${lit(form.b)}) : NAN;`);
  else if (form.kind === 'exp') body.push(`${I}return ${lit(form.a)} * exp(${lit(form.b)} * x);`);
  else if (form.kind === 'log')
    body.push(`${I}return x > 0.0 ? ${plusTerm(lit(form.a), form.b, 'log(x)', lit)} : NAN;`);
  else {
    if (form.kind === 'hermite' || form.kind === 'linear') {
      body.push(...array('knots', form.knots), ...array('values', form.values));
      if (form.kind === 'hermite') body.push(...array('slopes', form.slopes));
      body.push(`${I}const int n = (int)(sizeof knots / sizeof knots[0]);`);
    }
    body.push(
      fit.space.x === 'log' ? `${I}const double u = x > 0.0 ? log10(x) : NAN;` : `${I}const double u = x;`,
    );
    if (form.kind === 'poly') body.push(`${I}const double v = ${horner(form.c.map(lit), 'u')};`);
    else if (form.kind === 'rational')
      body.push(
        `${I}const double v = ${group(horner(form.p.map(lit), 'u'))} / (1.0 + u * ${group(horner(form.q.map(lit), 'u'))});`,
      );
    else {
      body.push(
        `${I}/* Interval i holds u (the end intervals continue outside the knots) */`,
        `${I}int i = 0;`,
        `${I}while (i < n - 2 && u >= knots[i + 1]) i++;`,
      );
      if (form.kind === 'hermite')
        body.push(
          `${I}const double h = knots[i + 1] - knots[i];`,
          `${I}const double s = (u - knots[i]) / h;`,
          `${I}const double s2 = s * s;`,
          `${I}const double s3 = s2 * s;`,
          `${I}const double v = (2.0 * s3 - 3.0 * s2 + 1.0) * values[i] + (s3 - 2.0 * s2 + s) * h * slopes[i]`,
          `${I}${I}+ (-2.0 * s3 + 3.0 * s2) * values[i + 1] + (s3 - s2) * h * slopes[i + 1];`,
        );
      else
        body.push(
          `${I}const double s = (u - knots[i]) / (knots[i + 1] - knots[i]);`,
          `${I}const double v = values[i] + s * (values[i + 1] - values[i]);`,
        );
    }
    body.push(fit.space.y === 'log' ? `${I}return pow(10.0, v);` : `${I}return v;`);
  }
  return [
    '/*',
    ...header.map((l) => ` * ${l.replace(/\*\//g, '* /')}`),
    ' */',
    '#include <math.h>',
    '',
    `double ${name}(double x)`,
    '{',
    ...body,
    '}',
    '',
  ].join('\n');
}
