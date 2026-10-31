import type { EmitContext } from './languages.ts';
import { group, horner, literal, operand, plusTerm, wrapItems } from './text.ts';

const I = '    ';

/** A column vector, so indexing it with a column of interval numbers gives a column (MATLAB keeps orientation). */
function column(name: string, values: readonly number[]): string[] {
  const lines = wrapItems(
    values.map((v) => literal(v)),
    88,
  );
  if (lines.length === 1) return [`${name} = [${lines[0] ?? ''}].';`];
  return [`${name} = [ ...`, ...lines.map((l) => `${I}${l} ...`), `].';`];
}

/**
 * A MATLAB function file (also GNU Octave), elementwise on an array x of any shape; NaN where the fit is
 * undefined. Save it as `<name>.m`.
 */
export function matlab({ fit, form, name, header }: EmitContext): string {
  const lit = (n: number) => literal(n);
  const body: string[] = [];
  const positive = 'x(x <= 0) = NaN;';
  if (form.kind === 'power') body.push(positive, `y = ${lit(form.a)} .* x .^ ${operand(lit(form.b))};`);
  else if (form.kind === 'exp') body.push(`y = ${lit(form.a)} .* exp(${lit(form.b)} .* x);`);
  else if (form.kind === 'log')
    body.push(positive, `y = ${plusTerm(lit(form.a), form.b, 'log(x)', lit).replace(' * ', ' .* ')};`);
  else {
    const table = form.kind === 'hermite' || form.kind === 'linear';
    if (table) body.push('sz = size(x);', 'x = x(:);');
    if (fit.space.x === 'log') body.push(positive, 'u = log10(x);');
    else body.push('u = x;');
    if (form.kind === 'poly') body.push(`v = ${horner(form.c.map(lit), 'u', { mul: '.*' })};`);
    else if (form.kind === 'rational')
      body.push(
        `v = ${group(horner(form.p.map(lit), 'u', { mul: '.*' }))} ./ (1 + u .* ${group(horner(form.q.map(lit), 'u', { mul: '.*' }))});`,
      );
    else {
      body.push(...column('knots', form.knots), ...column('values', form.values));
      if (form.kind === 'hermite') body.push(...column('slopes', form.slopes));
      body.push(
        '% Interval i holds u (the end intervals continue outside the knots)',
        "i = sum(u >= knots(2:end-1).', 2) + 1;",
      );
      if (form.kind === 'hermite')
        body.push(
          'h = knots(i + 1) - knots(i);',
          's = (u - knots(i)) ./ h;',
          's2 = s .* s;',
          's3 = s2 .* s;',
          'v = (2 .* s3 - 3 .* s2 + 1) .* values(i) + (s3 - 2 .* s2 + s) .* h .* slopes(i) ...',
          `${I}+ (-2 .* s3 + 3 .* s2) .* values(i + 1) + (s3 - s2) .* h .* slopes(i + 1);`,
        );
      else
        body.push(
          's = (u - knots(i)) ./ (knots(i + 1) - knots(i));',
          'v = values(i) + s .* (values(i + 1) - values(i));',
        );
    }
    const y = fit.space.y === 'log' ? '10 .^ v' : 'v';
    body.push(table ? `y = reshape(${y}, sz);` : `y = ${y};`);
  }
  const [first = '', ...rest] = header;
  return [
    `function y = ${name}(x)`,
    `%${name.toUpperCase()} ${first}`,
    ...rest.map((l) => `%   ${l}`),
    '%   x may be an array of any shape; y has the same shape (NaN where the fit is undefined).',
    ...body.map((l) => `${I}${l}`),
    'end',
    '',
  ].join('\n');
}
