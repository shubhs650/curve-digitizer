# Sample: sn-family

A log-log fatigue (S-N) chart in the style of design-code figures: one ink colour, dense minor grid.

Targets: A1 (calibration on log-log axes) and A4 (guided trace crosses every intersection without a wrong branch and without asking). The curves cross pairwise at the angles listed below, all ≥ 20°.

## Files

- `source.svg`: the vector source, drawn by `scripts/gen-samples.py`.
- `source.png`: `source.svg` rasterized by `scripts/render-samples.ts` (2000 × 1500 px). This is the image the app and the harness use.
- `ground-truth.json`: exact axis transform, tick positions, curve centerlines (≤ 1 px spacing), 25 exact points per curve and curve intersections.
- `ops.json`: the recorded user operations that `pnpm test:samples` replays.

## Chart

- X axis: log10, 10 to 1e+07
- Y axis: log10, 10 to 10000 MPa

| Dataset | Colour | Width (px) | Model |
|---|---|---|---|
| UTS 480 MPa | `#000000` | 2.5 | `S = 20 + 15000 N^-0.48` |
| UTS 690 MPa | `#000000` | 2.5 | `S = 200 + 1000 N^-0.37` |
| UTS 860 MPa | `#000000` | 2.5 | `S = 80 + 7000 N^-0.75` |

## Recorded operations

| Op | Kind | Acceptance targets |
|---|---|---|
| `calibrate` | calibrate | A1 |
| `trace-c1` | trace | A4 |
| `trace-c2` | trace | A4 |
| `trace-c3` | trace | A4 |

## Intersections

- c1 × c2 at px (1011.5, 769.9), crossing angle 27.6°
- c1 × c3 at px (1333.4, 959.9), crossing angle 26.7°
- c2 × c3 at px (427.0, 666.9), crossing angle 25.6°

Ground truth is immutable once committed; changing it needs an ADR in `docs/DECISIONS.md`. Regenerate with `python3 scripts/gen-samples.py`.
