export const packageName = '@cd/fit';

export type * from './types.ts';
export { fromSpace, spaceOfAxis, toSpace } from './space.ts';
export {
  isModelId,
  MODELS,
  type FitModel,
  MAX_AUTO_BREAKPOINTS,
  MAX_AUTO_KNOTS,
  quantileKnots,
} from './models/index.ts';
export { fitModel, fitPrepared, MIN_POINTS, prepareData } from './fit.ts';
export {
  candidateSpecs,
  MAX_DEGREE,
  PARSIMONY_AICC,
  parsimonious,
  RATIONAL_ORDERS,
  type Recommendation,
  recommendFits,
} from './recommend.ts';
export { evaluateFit, type FitValue, sampleFit } from './evaluate.ts';
export { oscillates } from './warnings.ts';
export {
  codeFileName,
  type CodeFit,
  type CodeForm,
  type CodeOptions,
  generateCode,
  identifier,
  LANGUAGES,
  type Language,
  type LanguageId,
  type SheetFit,
  sheetFit,
  type SheetTable,
} from './codegen/index.ts';
