import type { EmitContext } from './languages.ts';
import { group, horner, literal, operand, plusTerm, wrapItems } from './text.ts';

const I = '  ';

function array(name: string, values: readonly number[]): string[] {
  const lines = wrapItems(
    values.map((v) => literal(v)),
    96,
  );
  if (lines.length === 1) return [`${I}const ${name} = [${lines[0] ?? ''}];`];
  return [`${I}const ${name} = [`, ...lines.map((l) => `${I}${I}${l}`), `${I}];`];
}

/** JavaScript (also TypeScript once `x` is typed): y for one number x, NaN where the fit is undefined. */
export function javascript({ fit, form, name, header }: EmitContext): string {
  const lit = (n: number) => literal(n);
  const body: string[] = [];
  if (form.kind === 'power')
    body.push(`${I}return x > 0 ? ${lit(form.a)} * x ** ${operand(lit(form.b))} : NaN;`);
  else if (form.kind === 'exp') body.push(`${I}return ${lit(form.a)} * Math.exp(${lit(form.b)} * x);`);
  else if (form.kind === 'log')
    body.push(`${I}return x > 0 ? ${plusTerm(lit(form.a), form.b, 'Math.log(x)', lit)} : NaN;`);
  else {
    body.push(fit.space.x === 'log' ? `${I}const u = x > 0 ? Math.log10(x) : NaN;` : `${I}const u = x;`);
    if (form.kind === 'poly') body.push(`${I}const v = ${horner(form.c.map(lit), 'u')};`);
    else if (form.kind === 'rational')
      body.push(
        `${I}const v = ${group(horner(form.p.map(lit), 'u'))} / (1 + u * ${group(horner(form.q.map(lit), 'u'))});`,
      );
    else {
      body.push(...array('knots', form.knots), ...array('values', form.values));
      if (form.kind === 'hermite') body.push(...array('slopes', form.slopes));
      body.push(
        `${I}// Interval i holds u (the end intervals continue outside the knots)`,
        `${I}let i = 0;`,
        `${I}while (i < knots.length - 2 && u >= knots[i + 1]) i++;`,
      );
      if (form.kind === 'hermite')
        body.push(
          `${I}const h = knots[i + 1] - knots[i];`,
          `${I}const s = (u - knots[i]) / h;`,
          `${I}const s2 = s * s;`,
          `${I}const s3 = s2 * s;`,
          `${I}const v =`,
          `${I}${I}(2 * s3 - 3 * s2 + 1) * values[i] + (s3 - 2 * s2 + s) * h * slopes[i] +`,
          `${I}${I}(-2 * s3 + 3 * s2) * values[i + 1] + (s3 - s2) * h * slopes[i + 1];`,
        );
      else
        body.push(
          `${I}const s = (u - knots[i]) / (knots[i + 1] - knots[i]);`,
          `${I}const v = values[i] + s * (values[i + 1] - values[i]);`,
        );
    }
    body.push(fit.space.y === 'log' ? `${I}return 10 ** v;` : `${I}return v;`);
  }
  return [...header.map((l) => `// ${l}`), `function ${name}(x) {`, ...body, '}', ''].join('\n');
}
