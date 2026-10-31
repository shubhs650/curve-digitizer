# Samples

Synthetic charts with exact ground truth. They are the CI fixtures for the accuracy targets in `docs/ACCEPTANCE_TARGETS.md` and, from M3, the one-click demo projects (PRD §4.12).

| Sample | What it is | Targets measured on it |
|---|---|---|
| [`vector-clean`](vector-clean/README.md) | Clean vector pump chart, three coloured curves, linear axes, 2400 × 1600 px | A1, A2, A3 (≤ 1 px), A5, A6 |
| [`scan-tilted`](scan-tilted/README.md) | 1970s-style scan: tilted 1.6°, stretched, blurred, tinted, grainy, specks; one dashed curve | A3 (≤ 2 px) |
| [`sn-family`](sn-family/README.md) | Log-log S-N family, three black curves crossing pairwise at 25–28°, dense log grid | A1, A4 |
| [`dark-bg`](dark-bg/README.md) | Dark-background semi-log chart, two bright curves | none (Invert suggestion, task 2.2) |

Each sample directory holds `source.svg`, `source.png`, `ground-truth.json`, `ops.json` and `README.md`.

## Ground truth

Ground truth is analytic, not measured: `scripts/gen-samples.py` evaluates each curve's formula, draws it as a dense polyline (≤ 1 px between vertices) and records those same vertices, after the sample's pixel transform, as the centerline. `scripts/render-samples.ts` rasterizes the SVG with the repo's pinned Playwright Chromium at 1 px per SVG unit. The harness then checks that every rendered stroke is centred on its ground-truth centerline (median offset < 0.1 px; the samples measure about 0.03 px), so a half-pixel slip anywhere in the pipeline fails CI.

Pixel convention (ADR 25): px `[0, 0]` is the image's top-left corner, x grows right, y grows down, and pixel (i, j) has its centre at (i + 0.5, j + 0.5). Ops, ground truth and replayer outputs all use it.

`ground-truth.json` holds the axes, the exact axis ↔ px matrices (axis space is log10 of the value on log axes), every major tick where it meets its axis line, and per dataset: colour, line width, dash pattern, model formula, domain, the centerline, and 25 exact points at round X values. Curve intersections carry their crossing angle.

Ground truth is immutable once committed. Changing it needs an ADR in `docs/DECISIONS.md`.

## Recorded ops and `pnpm test:samples`

`ops.json` records what a user does on the sample: calibration clicks, manual picks near a curve, trace start and end picks, an eyedropper pick, X-step values. Each op lists the acceptance targets it feeds.

`pnpm test:samples` runs `scripts/samples/replay.samples.test.ts`. For every sample it validates the files, the transforms, the centerlines against the pixels, and the ops. Then, for every op and target, it calls the replayer registered for that op kind in `scripts/samples/replayers.ts` and scores the output with `scripts/samples/score.ts`. Kinds without a replayer show as **todo**, so the run stays green until the feature lands:

| Op kind | Replayer delivered by | Output it must return |
|---|---|---|
| `calibrate` | task 1.3 | `{ residualPx }` |
| `manualPick` | task 1.4 | `{ points }`, one per click, after snapping |
| `trace` | task 2.3 | `{ points, prompted }` |
| `colourMask` | task 2.5 | `{ paths }`, the components kept |
| `xStep` | task 2.6 | `{ points, outliers }`, one point per requested X |

A feature task adds its replayer to `replayers` (driving the real packages headlessly), and its targets become live tests. Scoring rules where the targets document is silent are in ADR 25 and the constants at the top of `score.ts`.

## Regenerating

```
pnpm install
python3 scripts/gen-samples.py      # needs NumPy; writes all four samples and renders the PNGs
```

Output is deterministic: running it again on the same machine reproduces every file byte for byte. A different Chromium build may anti-alias differently, which is harmless (the harness checks the PNGs against the ground truth), but do not commit a re-render without a reason.

To add a sample, add a function to `gen-samples.py`, add it to `main()`, and add its name to the sample list test in `replay.samples.test.ts`.
