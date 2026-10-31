import type { EmitContext } from './languages.ts';
import { group, horner, literal, operand, plusTerm, wrapItems } from './text.ts';

const I = '    ';

/** A Double literal: VBA reads `2` as an Integer, so whole numbers get the `#` type suffix. */
function lit(value: number): string {
  const text = literal(value);
  return /^-?\d+$/.test(text) ? `${text}#` : text;
}

/** `name = Array(...)`, continued over lines with ` _` (VBA allows 24 continuations; 8 numbers fit a line). */
function array(name: string, values: readonly number[]): string[] {
  const lines = wrapItems(values.map(lit), 80);
  if (lines.length === 1) return [`${I}${name} = Array(${lines[0] ?? ''})`];
  return [
    `${I}${name} = Array( _`,
    ...lines.map((l, i) => `${I}${I}${l}${i < lines.length - 1 ? ' _' : ')'}`),
  ];
}

/**
 * An Excel VBA function, usable from a worksheet as `=name(A2)`: returns #NUM! where the fit is undefined.
 * Paste it into a standard module (Alt+F11, Insert > Module).
 */
export function vba({ fit, form, name, header }: EmitContext): string {
  const body: string[] = [];
  const undefinedAt = (test: string) => [
    `${I}If ${test} Then`,
    `${I}${I}${name} = CVErr(xlErrNum)`,
    `${I}${I}Exit Function`,
    `${I}End If`,
  ];
  if (form.kind === 'power')
    body.push(...undefinedAt('x <= 0'), `${I}${name} = ${lit(form.a)} * x ^ ${operand(lit(form.b))}`);
  else if (form.kind === 'exp') body.push(`${I}${name} = ${lit(form.a)} * Exp(${lit(form.b)} * x)`);
  else if (form.kind === 'log')
    body.push(...undefinedAt('x <= 0'), `${I}${name} = ${plusTerm(lit(form.a), form.b, 'Log(x)', lit)}`);
  else {
    const table = form.kind === 'hermite' || form.kind === 'linear';
    body.push(`${I}Dim u As Double, v As Double`);
    if (table) {
      body.push(
        `${I}Dim knots As Variant, values As Variant${form.kind === 'hermite' ? ', slopes As Variant' : ''}`,
      );
      body.push(
        `${I}Dim i As Long, h As Double, s As Double${form.kind === 'hermite' ? ', s2 As Double, s3 As Double' : ''}`,
      );
    }
    if (fit.space.x === 'log') body.push(...undefinedAt('x <= 0'), `${I}u = Log(x) / Log(10#)`);
    else body.push(`${I}u = x`);
    if (form.kind === 'poly') body.push(`${I}v = ${horner(form.c.map(lit), 'u')}`);
    else if (form.kind === 'rational')
      body.push(
        `${I}v = ${group(horner(form.p.map(lit), 'u'))} / (1# + u * ${group(horner(form.q.map(lit), 'u'))})`,
      );
    else {
      body.push(...array('knots', form.knots), ...array('values', form.values));
      if (form.kind === 'hermite') body.push(...array('slopes', form.slopes));
      body.push(
        `${I}' Interval i holds u (the end intervals continue outside the knots)`,
        `${I}i = LBound(knots)`,
        `${I}Do While i < UBound(knots) - 1`,
        `${I}${I}If u < knots(i + 1) Then Exit Do`,
        `${I}${I}i = i + 1`,
        `${I}Loop`,
      );
      if (form.kind === 'hermite')
        body.push(
          `${I}h = knots(i + 1) - knots(i)`,
          `${I}s = (u - knots(i)) / h`,
          `${I}s2 = s * s`,
          `${I}s3 = s2 * s`,
          `${I}v = (2 * s3 - 3 * s2 + 1) * values(i) + (s3 - 2 * s2 + s) * h * slopes(i) _`,
          `${I}${I}+ (-2 * s3 + 3 * s2) * values(i + 1) + (s3 - s2) * h * slopes(i + 1)`,
        );
      else
        body.push(
          `${I}s = (u - knots(i)) / (knots(i + 1) - knots(i))`,
          `${I}v = values(i) + s * (values(i + 1) - values(i))`,
        );
    }
    body.push(fit.space.y === 'log' ? `${I}${name} = 10# ^ v` : `${I}${name} = v`);
  }
  return [
    ...header.map((l) => `' ${l}`),
    `Public Function ${name}(ByVal x As Double) As Variant`,
    ...body,
    'End Function',
    '',
  ].join('\n');
}
