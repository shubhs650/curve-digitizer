# Sample: dark-bg

A dark-theme chart, as exported from plotting tools and dashboards.

Used by the pre-processing panel (task 2.2): dark-background detection must suggest Invert. No accuracy target is measured on it; its ops are setup steps for demos and e2e tests.

## Files

- `source.svg`: the vector source, drawn by `scripts/gen-samples.py`.
- `source.png`: `source.svg` rasterized by `scripts/render-samples.ts` (1800 × 1200 px). This is the image the app and the harness use.
- `ground-truth.json`: exact axis transform, tick positions, curve centerlines (≤ 1 px spacing), 25 exact points per curve and curve intersections.
- `ops.json`: the recorded user operations that `pnpm test:samples` replays.

## Chart

- X axis: linear, 0 to 10 s
- Y axis: log10, 1 to 10000

| Dataset | Colour | Width (px) | Model |
|---|---|---|---|
| Run 1 | `#4cc9f0` | 3 | `N = 2 * 10^(0.35 t)` |
| Run 2 | `#ffd166` | 3 | `N = 1.2 * 10^(0.30 t)` |

## Recorded operations

| Op | Kind | Acceptance targets |
|---|---|---|
| `calibrate` | calibrate | (setup only) |
| `trace-d1` | trace | (setup only) |
| `trace-d2` | trace | (setup only) |

Ground truth is immutable once committed; changing it needs an ADR in `docs/DECISIONS.md`. Regenerate with `python3 scripts/gen-samples.py`.
