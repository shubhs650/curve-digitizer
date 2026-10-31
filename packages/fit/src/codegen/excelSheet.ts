import type { CodeForm } from './form.ts';
import { type CodeFit, formOf, header, horner } from './text.ts';

/** One named worksheet range of a fit's parameters: a single cell, or a column of a table. */
export interface SheetTable {
  /** The workbook name, `prefix_suffix`. */
  readonly name: string;
  /** The column heading shown above the values. */
  readonly label: string;
  readonly values: readonly number[];
}

/** A fit laid out for a worksheet (task 3.4): its parameters as named ranges and a live formula that reads them. */
export interface SheetFit {
  readonly form: CodeForm;
  /** Single cells (closed forms) or columns side by side (polynomials, rationals, knot tables). */
  readonly tables: readonly SheetTable[];
  /**
   * The formula for y at the cell `xRef`, as a worksheet file stores it: no leading `=`, and LET written
   * `_xlfn.LET` with `_xlpm.` names.
   */
  readonly formula: (xRef: string) => string;
  /** The code header: model, dataset, fit space, valid range and statistics. */
  readonly header: readonly string[];
}

/**
 * The fit as a worksheet would hold it: parameters in named ranges (`prefix_a`, `prefix_c`, `prefix_knots`, …),
 * read by a formula, so that editing a coefficient cell changes every value (PRD §4.9, task 3.4). Closed forms,
 * polynomials and rationals work in any Excel (polynomials by Horner's scheme over `INDEX`, which unlike
 * `SUMPRODUCT(c, u^n)` has no `0^0` error at u = 0); knot tables use LET (Excel 2021 or Microsoft 365).
 * `prefix` must be a valid Excel name that does not look like a cell (e.g. from {@link identifier}).
 */
export function sheetFit(fit: CodeFit, prefix: string, datasetName?: string): SheetFit {
  const form = formOf(fit);
  const n = (suffix: string) => `${prefix}_${suffix}`;
  const at = (name: string, k: number) => `INDEX(${name},${String(k + 1)})`;
  const fitSpace = (xRef: string, body: (u: string) => string): string => {
    const v = body(fit.space.x === 'log' ? `LOG10(${xRef})` : xRef);
    return fit.space.y === 'log' ? `10^(${v})` : v;
  };
  let tables: SheetTable[];
  let formula: (xRef: string) => string;
  switch (form.kind) {
    case 'power':
    case 'exp':
    case 'log': {
      const a = n('a');
      const b = n('b');
      tables = [
        { name: a, label: 'a', values: [form.a] },
        { name: b, label: 'b', values: [form.b] },
      ];
      formula =
        form.kind === 'power'
          ? (x) => `${a}*${x}^${b}`
          : form.kind === 'exp'
            ? (x) => `${a}*EXP(${b}*${x})`
            : (x) => `${a}+${b}*LN(${x})`;
      break;
    }
    case 'poly': {
      const c = n('c');
      tables = [{ name: c, label: 'c (u^0, u^1, …)', values: form.c }];
      formula = (x) =>
        fitSpace(x, (u) =>
          horner(
            form.c.map((_, k) => at(c, k)),
            u,
            { space: '' },
          ),
        );
      break;
    }
    case 'rational': {
      const p = n('p');
      const q = n('q');
      tables = [
        { name: p, label: 'p (u^0, u^1, …)', values: form.p },
        { name: q, label: 'q (u^0, u^1, …)', values: form.q },
      ];
      formula = (x) =>
        fitSpace(
          x,
          (u) =>
            `(${horner(
              form.p.map((_, k) => at(p, k)),
              u,
              { space: '' },
            )})/(1+${u}*(${horner(
              form.q.map((_, k) => at(q, k)),
              u,
              { space: '' },
            )}))`,
        );
      break;
    }
    case 'hermite':
    case 'linear': {
      const knots = n('knots');
      const values = n('values');
      const slopes = n('slopes');
      const k = form.knots.length;
      tables = [
        { name: knots, label: fit.space.x === 'log' ? 'knot log10(x)' : 'knot x', values: form.knots },
        { name: values, label: fit.space.y === 'log' ? 'log10(y)' : 'y', values: form.values },
        ...(form.kind === 'hermite' ? [{ name: slopes, label: 'slope', values: form.slopes }] : []),
      ];
      formula = (x) => {
        // In the file, LET is `_xlfn.LET` and its names `_xlpm.name` (Excel's storage form of newer functions;
        // without it Excel reads #NAME?). As the Excel snippet (ADR 40): the last knot ≤ u, the first interval
        // continued before the first knot.
        const p = (name: string) => `_xlpm.${name}`;
        const [u, i, lo, h, s, sq, cu, v] = ['u', 'i', 'lo', 'h', 's', 'sq', 'cu', 'v'].map(p) as [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ];
        const names = [
          `${u},${fit.space.x === 'log' ? `LOG10(${x})` : x}`,
          `${i},MIN(IFERROR(MATCH(${u},${knots},1),1),${String(k - 1)})`,
          `${lo},INDEX(${knots},${i})`,
          `${h},INDEX(${knots},${i}+1)-${lo}`,
          `${s},(${u}-${lo})/${h}`,
        ];
        if (form.kind === 'hermite')
          names.push(
            `${sq},${s}*${s}`,
            `${cu},${sq}*${s}`,
            `${v},(2*${cu}-3*${sq}+1)*INDEX(${values},${i})+(${cu}-2*${sq}+${s})*${h}*INDEX(${slopes},${i})` +
              `+(-2*${cu}+3*${sq})*INDEX(${values},${i}+1)+(${cu}-${sq})*${h}*INDEX(${slopes},${i}+1)`,
          );
        else names.push(`${v},INDEX(${values},${i})+${s}*(INDEX(${values},${i}+1)-INDEX(${values},${i}))`);
        return `_xlfn.LET(${names.join(',')},${fit.space.y === 'log' ? `10^${v}` : v})`;
      };
      break;
    }
  }
  return {
    form,
    tables,
    formula,
    header: header(fit, form, datasetName).lines,
  };
}
