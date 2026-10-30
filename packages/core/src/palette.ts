/**
 * Dataset colours (PRD §4.7), assigned in order: Okabe–Ito followed by darker Paul Tol "muted" hues. All ten
 * stay distinguishable under the common colour-vision deficiencies and have at least 3:1 contrast on white
 * except the sky blue, which the overlay's dark marker ring makes visible.
 */
export const DATASET_PALETTE = [
  '#0072b2',
  '#d55e00',
  '#009e73',
  '#cc79a7',
  '#e69f00',
  '#56b4e9',
  '#882255',
  '#117733',
  '#332288',
  '#999933',
] as const;

/** The first palette colour no existing dataset uses; cycles through the palette once all are taken. */
export function nextDatasetColor(used: readonly string[]): string {
  const taken = new Set(used.map((c) => c.toLowerCase()));
  return (
    DATASET_PALETTE.find((c) => !taken.has(c)) ??
    DATASET_PALETTE[used.length % DATASET_PALETTE.length] ??
    '#000000'
  );
}
