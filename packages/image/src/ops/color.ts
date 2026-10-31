import { deltaE, parseHexColor, rgbToLab, toHexColor } from '../color.ts';
import { type FilterOp, FilterParamError, mapPixels, numberParam } from './types.ts';

/**
 * Keeps pixels within ΔE*ab ≤ `tolerance` of `color` and turns everything else white, so one curve of a
 * multi-colour chart is all the tracers see.
 */
export const isolateColor: FilterOp<{ readonly color: string; readonly tolerance: number }> = {
  op: 'isolateColor',
  label: 'Isolate colour',
  defaults: { color: '#000000', tolerance: 25 },
  parse: (p) => {
    const rgb = typeof p.color === 'string' ? parseHexColor(p.color) : null;
    if (rgb === null) throw new FilterParamError('color must be a #rrggbb colour');
    return { color: toHexColor(rgb), tolerance: numberParam(p, 'tolerance', 25, 0, 200) };
  },
  apply: (src, { color, tolerance }, tick) => {
    const target = rgbToLab(...(parseHexColor(color) ?? [0, 0, 0]));
    const memo = new Map<number, boolean>();
    return mapPixels(src, tick, (r, g, b, out) => {
      const key = (r << 16) | (g << 8) | b;
      let keep = memo.get(key);
      if (keep === undefined) {
        keep = deltaE(rgbToLab(r, g, b), target) <= tolerance;
        memo.set(key, keep);
      }
      out[0] = keep ? r : 255;
      out[1] = keep ? g : 255;
      out[2] = keep ? b : 255;
    });
  },
};
