import type { Graph } from '@cd/core';
import { pixelToValue } from '@cd/math';

/** More X values than this is a typo (a step far too small), not a request. */
export const MAX_X_VALUES = 2000;

export type XValuesResult =
  { readonly ok: true; readonly xs: readonly number[] } | { readonly ok: false; readonly message: string };

const round12 = (v: number) => Number(v.toPrecision(12));

/** from, from + step, … up to `to` inclusive (to within a millionth of a step), in either direction. */
export function stepValues(from: number, to: number, step: number): XValuesResult {
  if (![from, to, step].every(Number.isFinite))
    return { ok: false, message: 'Enter numbers for From, To and Step' };
  if (step <= 0) return { ok: false, message: 'Step must be more than 0' };
  const count = Math.floor(Math.abs(to - from) / step + 1e-6) + 1;
  if (count > MAX_X_VALUES)
    return { ok: false, message: `That is over ${String(MAX_X_VALUES)} X values; use a larger step` };
  const sign = to >= from ? 1 : -1;
  // Rounded to 12 significant digits, so 0.1 steps read 0.3, not 0.30000000000000004.
  return {
    ok: true,
    xs: Array.from({ length: count }, (_, i) => round12(from + sign * i * step)),
  };
}

/** X values typed as a list, separated by commas, semicolons, spaces or new lines. */
export function parseValueList(text: string): XValuesResult {
  const parts = text.split(/[\s,;]+/).filter((p) => p !== '');
  if (parts.length === 0) return { ok: false, message: 'Enter at least one X value' };
  const xs = parts.map(Number);
  const bad = parts.find((_, i) => !Number.isFinite(xs[i]));
  if (bad !== undefined) return { ok: false, message: `"${bad}" is not a number` };
  if (xs.length > MAX_X_VALUES)
    return { ok: false, message: `That is over ${String(MAX_X_VALUES)} X values` };
  return { ok: true, xs };
}

/** A round step giving about `count` intervals over [from, to]: 1, 2 or 5 times a power of ten. */
export function niceStep(from: number, to: number, count = 20): number {
  const raw = Math.abs(to - from) / count;
  if (!(raw > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(raw));
  // Rounded so 0.035 / 0.01 reads 3.5, not 3.4999999999999996.
  const mantissa = round12(raw / power);
  return round12((mantissa < 1.5 ? 1 : mantissa < 3.5 ? 2 : mantissa < 7.5 ? 5 : 10) * power);
}

/** Default From/To/Step: the image's X range at mid-height, rounded to the step. */
export function defaultRange(graph: Graph): {
  readonly from: number;
  readonly to: number;
  readonly step: number;
} {
  const c = graph.calibration;
  if (c === null) return { from: 0, to: 100, step: 5 };
  const axes = { x: c.xAxis.type, y: c.yAxis.type };
  const mid = graph.image.height / 2;
  const a = pixelToValue(c.matrix, axes, [0, mid])[0];
  const b = pixelToValue(c.matrix, axes, [graph.image.width, mid])[0];
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  const step = niceStep(lo, hi);
  return { from: round12(Math.ceil(lo / step) * step), to: round12(Math.floor(hi / step) * step), step };
}

/** The X values the settings ask for; empty From/To/Step fields take the graph's defaults. */
export function resolveXs(
  graph: Graph,
  settings: {
    readonly mode: 'step' | 'list';
    readonly from: string | null;
    readonly to: string | null;
    readonly step: string | null;
    readonly list: string;
  },
): XValuesResult {
  if (settings.mode === 'list') return parseValueList(settings.list);
  const d = defaultRange(graph);
  const num = (text: string | null, fallback: number) =>
    text === null || text.trim() === '' ? fallback : Number(text);
  return stepValues(num(settings.from, d.from), num(settings.to, d.to), num(settings.step, d.step));
}
