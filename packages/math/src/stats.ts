/**
 * Corrected Akaike information criterion for a least-squares fit with Gaussian errors:
 * AICc = n·ln(RSS/n) + 2k + 2k(k + 1)/(n − k − 1) (docs/ARCHITECTURE.md §8.5). Lower is better; only differences
 * between fits to the same data in the same space mean anything.
 *
 * @throws RangeError when n ≤ k + 1, where the correction term is undefined.
 */
export function aicc(rss: number, n: number, k: number): number {
  if (!(n > k + 1)) throw new RangeError(`AICc needs n > k + 1 (n = ${String(n)}, k = ${String(k)})`);
  return n * Math.log(rss / n) + 2 * k + (2 * k * (k + 1)) / (n - k - 1);
}
