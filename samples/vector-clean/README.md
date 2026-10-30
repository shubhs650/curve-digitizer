# Sample: vector-clean

A clean vector chart, as rendered from a PDF crop at about 300 DPI.

Targets: A1 (calibration), A2 (snapped manual picks), A3 (guided trace ≤ 1 px RMS), A5 (colour mask ≥ 98 % of length), A6 (X-step at 25 X values). The curves span about 2 000 px, which is the P4 trace size. The three model families (poly-3, exponential, power) are also A7 fit families.

## Files

- `source.svg`: the vector source, drawn by `scripts/gen-samples.py`.
- `source.png`: `source.svg` rasterized by `scripts/render-samples.ts` (2400 × 1600 px). This is the image the app and the harness use.
- `ground-truth.json`: exact axis transform, tick positions, curve centerlines (≤ 1 px spacing), 25 exact points per curve and curve intersections.
- `ops.json`: the recorded user operations that `pnpm test:samples` replays.

## Chart

- X axis: linear, 0 to 100 m³/h
- Y axis: linear, 0 to 60 m

| Dataset | Colour | Width (px) | Model |
|---|---|---|---|
| Pump A | `#1f77b4` | 3 | `H = 52 + 0.05 Q - 0.0035 Q^2 - 0.000012 Q^3` |
| Pump B | `#ff7f0e` | 3 | `H = 38 exp(-0.012 Q)` |
| Pump C | `#2ca02c` | 3 | `H = 30 Q^-0.35` |

## Recorded operations

| Op | Kind | Acceptance targets |
|---|---|---|
| `calibrate` | calibrate | A1 |
| `pick-d1` | manualPick | A2 |
| `pick-d2` | manualPick | A2 |
| `pick-d3` | manualPick | A2 |
| `trace-d1` | trace | A3 |
| `trace-d2` | trace | A3 |
| `trace-d3` | trace | A3 |
| `mask-d1` | colourMask | A5 |
| `mask-d2` | colourMask | A5 |
| `mask-d3` | colourMask | A5 |
| `xstep-d1` | xStep | A6 |
| `xstep-d2` | xStep | A6 |
| `xstep-d3` | xStep | A6 |

Ground truth is immutable once committed; changing it needs an ADR in `docs/DECISIONS.md`. Regenerate with `python3 scripts/gen-samples.py`.
