/**
 * What a fit computes, in the few shapes every code generator knows how to write (docs/DECISIONS.md, ADR 40).
 * Closed-form laws act on data x and give data y. The other forms act in fit space: u = log10(x) on a log x
 * axis (else x), and the result v is y, or log10(y) on a log y axis. Splines (natural and PCHIP) are both
 * written as cubic Hermite tables, with knot slopes, so one interpolation snippet serves both.
 */
export type CodeForm =
  /** y = a·x^b, y = a·e^(b·x), y = a + b·ln x. */
  | { readonly kind: 'power'; readonly a: number; readonly b: number }
  | { readonly kind: 'exp'; readonly a: number; readonly b: number }
  | { readonly kind: 'log'; readonly a: number; readonly b: number }
  /** v = c₀ + c₁·u + … (ascending). */
  | { readonly kind: 'poly'; readonly c: readonly number[] }
  /** v = P(u) / (1 + u·Q(u)), p and q ascending. */
  | { readonly kind: 'rational'; readonly p: readonly number[]; readonly q: readonly number[] }
  | {
      readonly kind: 'hermite';
      readonly knots: readonly number[];
      readonly values: readonly number[];
      readonly slopes: readonly number[];
    }
  | { readonly kind: 'linear'; readonly knots: readonly number[]; readonly values: readonly number[] };

/** Whether a form acts in fit space (u, v) rather than on data x and y. */
export function inFitSpace(form: CodeForm): boolean {
  return form.kind !== 'power' && form.kind !== 'exp' && form.kind !== 'log';
}
