# Pre-processing

Pre-processing cleans up a graph's image for the tracers without changing the image itself. Filters form a stack that runs top to bottom; the stack is saved in the project, so a reviewer can see exactly what the tracer was given. Points are always drawn over the original pixels, and only the tracers read the processed ones.

## Filters

| Filter | What it does | Settings |
|---|---|---|
| Brightness | Lightens or darkens every pixel. | Amount, −1 to 1 (0 = unchanged). |
| Contrast | Spreads the tones away from mid-grey. **Auto** first stretches the darkest and lightest tones in the image (ignoring the extreme 0.5 % at each end) to black and white, which revives a faded scan. | Factor (1 = unchanged), Auto. |
| Grayscale | Removes colour (Rec. 601 luma). | — |
| Invert | Swaps light and dark. Use it on dark-background charts: the tracers expect dark lines on light paper. | — |
| Threshold | Makes every pixel black or white. | Level 0–1 of darkness; empty picks one automatically (Otsu's method). |
| Despeckle | Median filter: removes dust, specks and scan grain smaller than the window. A radius of 1 keeps lines 3 px and wider; a larger radius also thins narrow lines. | Radius 1–5 px. |
| Suppress grid lines | Finds long straight horizontal and vertical lines, even on a slightly tilted scan, and paints them in the paper colour. Where a curve crosses a grid line the curve's pixels are kept. | Minimum run (px): only straight lines at least this long are removed. Tolerance (px): gaps a line may have (dotted grids), and extra width allowed before a crossing counts as a curve. |
| Isolate colour | Keeps only pixels close to one colour and turns the rest white, so a single curve of a multi-colour chart stands out. | Colour, tolerance (ΔE; about 2 is a just-visible difference). |

A curve segment that is itself straight and level (or vertical) for longer than the **Minimum run** looks like a grid line and is removed too. If a flat part of a curve disappears, raise the minimum run above its length; grid lines usually span the whole plot.

Filters that this version does not recognise, for example in a project saved by a newer version, are kept in the project but skipped.
