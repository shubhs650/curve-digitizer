import { columnNorm, lstsq } from './linalg.ts';

export interface LeastSquaresProblem {
  /** Residuals rᵢ(p); the solver minimises Σ rᵢ². Non-finite entries reject the step that produced them. */
  readonly residuals: (p: readonly number[]) => number[];
  /** Jacobian ∂rᵢ/∂pⱼ as rows (one per residual). */
  readonly jacobian: (p: readonly number[]) => number[][];
}

export interface LeastSquaresResult {
  readonly params: number[];
  /** Σ rᵢ² at `params`. */
  readonly cost: number;
  readonly iterations: number;
  readonly converged: boolean;
}

const MAX_ITERATIONS = 400;

function sumSquares(r: readonly number[]): number {
  let s = 0;
  for (const ri of r) s += ri * ri;
  return s;
}

/**
 * Nonlinear least squares by Levenberg–Marquardt: each step δ solves
 * min ‖J·δ + r‖² + λ‖D·δ‖², D = diag(‖column j of J‖) (Marquardt's scaling, so the damping does not depend on
 * the units of each parameter), written as the augmented least-squares system [J; √λ·D]·δ = [−r; 0] and solved
 * by QR. λ shrinks ×1/3 after an accepted step and grows ×4 after a rejected one. Stops when a step changes
 * every parameter by less than 1e-13 of its size, or the cost by less than 1e-16 relatively.
 */
export function levenbergMarquardt(problem: LeastSquaresProblem, p0: readonly number[]): LeastSquaresResult {
  let p = [...p0];
  let r = problem.residuals(p);
  let cost = sumSquares(r);
  if (!Number.isFinite(cost))
    throw new RangeError('levenbergMarquardt: residuals are not finite at the start');
  let lambda = 1e-3;
  let iterations = 0;
  let converged = false;
  while (iterations < MAX_ITERATIONS && !converged) {
    iterations++;
    const j = problem.jacobian(p);
    const d = p.map((_, c) => columnNorm(j, c) || 1);
    let accepted = false;
    while (!accepted && lambda < 1e16) {
      const rows = [...j, ...d.map((dc, c) => p.map((_, k) => (k === c ? Math.sqrt(lambda) * dc : 0)))];
      const rhs = [...r.map((ri) => -ri), ...p.map(() => 0)];
      let step: number[];
      try {
        step = lstsq(rows, rhs);
      } catch {
        lambda *= 4;
        continue;
      }
      const next = p.map((pi, k) => pi + (step[k] ?? 0));
      const nextR = problem.residuals(next);
      const nextCost = sumSquares(nextR);
      if (Number.isFinite(nextCost) && nextCost <= cost) {
        const small = step.every((s, k) => Math.abs(s) <= 1e-13 * (Math.abs(next[k] ?? 0) + 1e-300));
        converged = small || cost - nextCost <= 1e-16 * cost;
        p = next;
        r = nextR;
        cost = nextCost;
        lambda = Math.max(lambda / 3, 1e-12);
        accepted = true;
      } else {
        lambda *= 4;
      }
    }
    if (!accepted) converged = true;
  }
  return { params: p, cost, iterations, converged };
}
