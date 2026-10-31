import type { Mask } from './raster.ts';

/**
 * Zhang–Suen thinning (Zhang & Suen 1984, "A fast parallel algorithm for thinning digital patterns"): peels
 * boundary pixels in two alternating sub-iterations until nothing changes, leaving an 8-connected skeleton one
 * pixel wide that keeps the topology of the mask. With P2…P9 the neighbours clockwise from north, B the number
 * of set neighbours and A the number of 0→1 transitions around them, a pixel is removed when 2 ≤ B ≤ 6, A = 1
 * and, in sub-iteration 1, P2·P4·P6 = 0 and P4·P6·P8 = 0 (in sub-iteration 2, P2·P4·P8 = 0 and P2·P6·P8 = 0).
 * Pixels outside the image count as unset. `keepDiagonals` applies the Lü–Wang correction (Lü & Wang 1986,
 * "A comment on 'A fast parallel algorithm for thinning digital patterns'"): 3 ≤ B ≤ 6, which stops 45° strokes
 * two pixels thick from being erased completely, at the cost of leaving them two pixels thick.
 */
export function thin(
  mask: Mask,
  tick?: () => void,
  options: { readonly keepDiagonals?: boolean } = {},
): Mask {
  const minNeighbours = options.keepDiagonals === true ? 3 : 2;
  const { width, height } = mask;
  const img = Uint8Array.from(mask.data);
  const at = (x: number, y: number): number =>
    x < 0 || y < 0 || x >= width || y >= height ? 0 : (img[y * width + x] ?? 0);
  // Only pixels on the current boundary can change, so each pass visits a candidate list instead of the image.
  let candidates: number[] = [];
  for (let i = 0; i < img.length; i++) if (img[i]) candidates.push(i);
  const remove: number[] = [];
  for (;;) {
    let changed = false;
    for (const step of [0, 1] as const) {
      tick?.();
      remove.length = 0;
      for (const i of candidates) {
        if (!img[i]) continue;
        const x = i % width;
        const y = (i - x) / width;
        const p2 = at(x, y - 1);
        const p3 = at(x + 1, y - 1);
        const p4 = at(x + 1, y);
        const p5 = at(x + 1, y + 1);
        const p6 = at(x, y + 1);
        const p7 = at(x - 1, y + 1);
        const p8 = at(x - 1, y);
        const p9 = at(x - 1, y - 1);
        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (b < minNeighbours || b > 6) continue;
        const ring = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
        let a = 0;
        for (let k = 0; k < 8; k++) if (ring[k] === 0 && ring[k + 1] === 1) a++;
        if (a !== 1) continue;
        if (
          step === 0 ? p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0 : p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0
        ) {
          continue;
        }
        remove.push(i);
      }
      for (const i of remove) img[i] = 0;
      if (remove.length > 0) changed = true;
    }
    if (!changed) break;
    candidates = candidates.filter((i) => img[i]);
  }
  return { width, height, data: img };
}
