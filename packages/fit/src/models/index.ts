import type { ModelId } from '../types.ts';
import { exponential, logarithmic, power } from './closedForms.ts';
import type { FitModel } from './model.ts';
import { pchipModel, piecewise, polynomial, rational, spline } from './shapes.ts';

export type { FitModel } from './model.ts';
export { MAX_AUTO_BREAKPOINTS, MAX_AUTO_KNOTS, quantileKnots } from './shapes.ts';

/** Every fit model by id (docs/PRD.md §4.8). Rev 1 may open this to plugins (docs/ARCHITECTURE.md §13). */
export const MODELS: Readonly<Record<ModelId, FitModel>> = {
  poly: polynomial,
  power,
  exp: exponential,
  log: logarithmic,
  rational,
  spline,
  pchip: pchipModel,
  piecewise,
};

export function isModelId(id: string): id is ModelId {
  return Object.hasOwn(MODELS, id);
}
