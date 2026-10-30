# Sample: scan-tilted

A scanned design chart: the page is rotated 1.6° with a slight vertical stretch and shear, blurred, tinted and grainy, with dust specks.

Target: A3 (guided trace ≤ 2 px RMS). The dashed curve exercises gap bridging; the tilt exercises affine calibration. The ground-truth transform includes the tilt.

## Files

- `source.svg`: the vector source, drawn by `scripts/gen-samples.py`.
- `source.png`: `source.svg` rasterized by `scripts/render-samples.ts` (1700 × 1200 px). This is the image the app and the harness use.
- `ground-truth.json`: exact axis transform, tick positions, curve centerlines (≤ 1 px spacing), 25 exact points per curve and curve intersections.
- `ops.json`: the recorded user operations that `pnpm test:samples` replays.

## Chart

- X axis: linear, 0 to 500 °C
- Y axis: linear, 0 to 160 MPa

| Dataset | Colour | Width (px) | Model |
|---|---|---|---|
| Carbon steel | `#262626` | 2.6 | `S = 118 / (1 + exp((T - 400) / 30)) + 20` |
| Low-alloy steel | `#262626` dashed | 2.6 | `S = 70 / (1 + exp((T - 380) / 30)) + 8` |

## Recorded operations

| Op | Kind | Acceptance targets |
|---|---|---|
| `calibrate` | calibrate | (setup only) |
| `trace-d1` | trace | A3 |
| `trace-d2` | trace | A3 |

Specks are kept at least 12 px from the curves so they never touch the ground-truth centerline.

Ground truth is immutable once committed; changing it needs an ADR in `docs/DECISIONS.md`. Regenerate with `python3 scripts/gen-samples.py`.
