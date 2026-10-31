import type { EmitContext } from './languages.ts';
import { group, horner, literal, operand, plusTerm } from './text.ts';

/** Excel keeps 15 significant digits of a typed number; exponents are written `1.5E-7`. */
function lit(value: number): string {
  return literal(value, 15).replace('e', 'E');
}

/** Excel's longest string literal. */
const MAX_TEXT = 255;

/**
 * The short header as a no-op term: `N("text")` is 0, so the formula carries its range and statistics with it.
 * Double quotes in a dataset name become single quotes.
 */
function comment(note: readonly string[]): string {
  const text = note.join('; ').replace(/"/g, "'").slice(0, MAX_TEXT);
  return `+N("${text}")`;
}

const x = 'x';

/**
 * One worksheet formula for the cell next to an X value (`xRef`, default A2). Closed forms and polynomials work
 * in any Excel; a knot table needs LET (Excel 2021 or Microsoft 365) for its array constants; on older Excel use
 * the VBA function. Names avoid R and C (reserved by R1C1 references) and letters followed by digits (cells).
 */
export function excel({ fit, form, note, xRef }: EmitContext): string {
  const fitSpace = (body: (u: string) => string): string => {
    const u = fit.space.x === 'log' ? `LOG10(${xRef})` : xRef;
    const v = body(u);
    return fit.space.y === 'log' ? `10^(${v})` : v;
  };
  let formula: string;
  if (form.kind === 'power') formula = `${lit(form.a)}*${xRef}^${operand(lit(form.b))}`;
  else if (form.kind === 'exp') formula = `${lit(form.a)}*EXP(${lit(form.b)}*${xRef})`;
  else if (form.kind === 'log') formula = plusTerm(lit(form.a), form.b, `LN(${xRef})`, lit, '');
  else if (form.kind === 'poly') formula = fitSpace((u) => horner(form.c.map(lit), u, { space: '' }));
  else if (form.kind === 'rational')
    formula = fitSpace(
      (u) =>
        `${group(horner(form.p.map(lit), u, { space: '' }))}/(1+${u}*${group(horner(form.q.map(lit), u, { space: '' }))})`,
    );
  else {
    const k = form.knots.length;
    const table = (values: readonly number[]) => `{${values.map(lit).join(',')}}`;
    const names: string[] = [
      `${x},${xRef}`,
      fit.space.x === 'log' ? `u,LOG10(${x})` : `u,${x}`,
      `knots,${table(form.knots)}`,
      `values,${table(form.values)}`,
    ];
    if (form.kind === 'hermite') names.push(`slopes,${table(form.slopes)}`);
    // MATCH(…, 1) is the last knot ≤ u; before the first knot it is #N/A, and the first interval continues.
    names.push(
      `i,MIN(IFERROR(MATCH(u,knots,1),1),${String(k - 1)})`,
      'lo,INDEX(knots,i)',
      'h,INDEX(knots,i+1)-lo',
      's,(u-lo)/h',
    );
    if (form.kind === 'hermite')
      names.push(
        'sq,s*s',
        'cu,sq*s',
        'v,(2*cu-3*sq+1)*INDEX(values,i)+(cu-2*sq+s)*h*INDEX(slopes,i)' +
          '+(-2*cu+3*sq)*INDEX(values,i+1)+(cu-sq)*h*INDEX(slopes,i+1)',
      );
    else names.push('v,INDEX(values,i)+s*(INDEX(values,i+1)-INDEX(values,i))');
    formula = `LET(${names.join(',')},${fit.space.y === 'log' ? '10^v' : 'v'})`;
  }
  return `=${formula}${comment(note)}\n`;
}
