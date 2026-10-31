import { lstsqScaled } from './linalg.ts';

/**
 * Value of the polynomial `c[0] + c[1]·x + … + c[d]·x^d` (ascending coefficients), by Horner's rule:
 * `((c[d]·x + c[d−1])·x + …)·x + c[0]`.
 */
export function polyval(c: readonly number[], x: number): number {
  let y = 0;
  for (let i = c.length - 1; i >= 0; i--) y = y * x + (c[i] ?? Number.NaN);
  return y;
}

/**
 * Least-squares polynomial of degree `degree` through `(x, y)`: ascending coefficients c minimising
 * Σ (polyval(c, xᵢ) − yᵢ)², as `numpy.polyfit` (which returns them descending).
 *
 * Solved as the Vandermonde system V·c = y with every column scaled to unit norm first, as NumPy does, so a
 * degree-9 fit on x ≈ 10³ is not rejected for the spread of its column norms alone.
 *
 * @throws DegenerateError when the system is rank deficient (fewer distinct x than degree + 1, or the powers of
 * x are numerically collinear).
 */
export function polyfit(x: readonly number[], y: readonly number[], degree: number): number[] {
  if (!Number.isInteger(degree) || degree < 0) throw new RangeError(`polyfit: bad degree ${String(degree)}`);
  if (x.length !== y.length) throw new RangeError('polyfit: x and y differ in length');
  const rows = x.map((xi) => {
    const row = new Array<number>(degree + 1);
    let p = 1;
    for (let j = 0; j <= degree; j++) {
      row[j] = p;
      p *= xi;
    }
    return row;
  });
  return lstsqScaled(rows, y);
}
