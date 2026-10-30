# Milestones and work breakdown

Each milestone is a public release. Each task below is sized to be one PR from one agent thread. Dependencies are listed so threads can run in parallel. Status is tracked in GitHub Issues with the labels `M1`, `M2`, `M3`.

## M0 — Scaffold (prerequisite for everything)

| # | Task | Depends on | Done when |
|---|---|---|---|
| 0.1 | pnpm monorepo, TS strict, ESLint/Prettier, Vitest, Playwright, CI workflow green on an empty app | — | `pnpm lint typecheck test build` pass in CI |
| 0.2 | `apps/web` React + Fluent UI v9 shell: header (Home/Docs/Report issue/GitHub), empty layout regions, light/dark theme tokens | 0.1 | renders, axe passes |
| 0.3 | `packages/core`: Project types from `docs/PROJECT_SCHEMA.md`, `ProjectStore` with command pattern + undo/redo, `.cdz` read/write, audit JSON, migrations scaffold | 0.1 | unit tests incl. round-trip |
| 0.4 | `packages/math`: 2-D affine/projective solve, residuals, log axis mapping, Jacobian-based uncertainty; fixtures vs NumPy | 0.1 | unit tests |
| 0.5 | `packages/workers`: Comlink render/compute worker skeleton with progress + cancel protocol | 0.1 | unit test with fake task |
| 0.6 | `samples/`: create the 4 sample images (vector-clean, scan-tilted, sn-family, dark-bg) as SVG→PNG plus ground-truth JSON; `test:samples` harness | 0.3, 0.4 | harness runs (expect failures until features land) |
| 0.7 | PWA: vite-plugin-pwa, manifest, file handlers, "new version" prompt, CSP | 0.2 | offline reload e2e |

## M1 — Manual core (target: OET launch)

| # | Task | Depends on | Done when |
|---|---|---|---|
| 1.1 | Image input: file picker, drag-drop, clipboard paste → Graph with `image` source; OPFS storage; project list home screen | 0.3, 0.7 | e2e |
| 1.2 | Canvas: zoom/pan, overlay layer, hit-testing via spatial index, loupe with crosshair | 0.2 | e2e + no long task |
| 1.3 | Calibration tool: 4-point placement, value entry (lin/log per axis), affine/projective, residual readout, warnings, grid replot overlay, resolution summary | 0.4, 1.2 | A1, unit |
| 1.4 | Manual points: place/drag/delete/multi-select, keyboard nudge, magnetic snap (needs thinness map from `packages/image` — minimal version) | 1.2, 1.3 | A2, U3 |
| 1.5 | Datasets panel: add/rename/colour/param/units/sourceRef/notes, mode function/path, point flags | 0.3 | unit + e2e |
| 1.6 | Data table dock: live, editable cells, residual column placeholder, copy to clipboard | 1.4 | e2e |
| 1.7 | `packages/pdf`: EmbedPDF lazy load, open from OPFS, thumbnails, crop-render at DPI with pixel budget, password handling, failure → image-only | 0.5 | R5, R6, R7, P2, P3 |
| 1.8 | PDF UI: pages sidebar, crop tool, DPI chooser, rotation, "Re-render at higher DPI" command rescaling px | 1.7, 1.2 | e2e |
| 1.9 | Export: CSV wide+long, basic XLSX (Data + Project sheets), JSON | 0.3 | unit golden files |
| 1.10 | Autosave + crash recovery, `.cdz` open/save via file handler and buttons | 0.3 | R2, R3 |
| 1.11 | Guided-mode checklist, shortcut cheat sheet, docs route with M1 pages | 0.2 | U1, U2 |
| 1.12 | Release: CHANGELOG, version, Cloudflare Pages config, acceptance run | all | checklist |

## M2 — Smart tracing

| # | Task | Depends on | Done when |
|---|---|---|---|
| 2.1 | `packages/image`: full filter stack (brightness/contrast/grayscale/invert/threshold/despeckle/isolate-colour), grid suppression, CIELAB distance, thinning, distance transform; cache by stack hash | 0.5 | unit + benchmarks |
| 2.2 | Pre-processing panel: stackable live preview, "Enhance for tracing" preset, before/after, dark-bg detection suggests Invert | 2.1 | e2e |
| 2.3 | Guided tracer (`packages/trace`): cost map, corridor A*, turn penalty, gap bridging, ambiguity return | 2.1 | A3, A4, P4 |
| 2.4 | Guided tracer UI: start/end picks, progress, cancel, branch prompt, density setting, eyedropper → dataset colour | 2.3 | e2e |
| 2.5 | Colour-mask tracer + UI (tolerance, component picker) | 2.1 | A5 |
| 2.6 | X-step sampler + UI (step or list, outlier marking) | 2.3 | A6 |
| 2.7 | Uncertainty: line-width estimate from trace/snap, sigma propagation, table + export column | 0.4, 2.3 | A9 |
| 2.8 | Docs for M2, samples ground truth for trace, release | all | checklist |

## M3 — Fitting & extras

| # | Task | Depends on | Done when |
|---|---|---|---|
| 3.1 | `packages/fit`: model registry (poly, power, exp, log, rational, cubic spline, PCHIP, piecewise linear), log-space handling, AICc ranking, extrapolation flags | 0.4 | A7 |
| 3.2 | Fit panel: auto-recommend top 3, residual plots, model picker, exclude-from-fit respected, fit curve drawn over original | 3.1 | e2e |
| 3.3 | Code generators: Python, JS, Excel formula, VBA, MATLAB, C/C++ with range + stats comments; spline → knot table + snippet | 3.1 | A8 |
| 3.4 | Excel export v2: Fit sheet with named ranges + live formulas, VBA sheet, embedded chart, crop image | 3.1, 1.9 | P6, golden |
| 3.5 | Interpolation calculator panel; compare-curves readout | 3.1 | e2e |
| 3.6 | Reference overlay (second crop, opacity, offset) | 1.8 | e2e |
| 3.7 | Error reporter dialog (opt-in, prefilled GitHub issue, copy) | 0.2 | e2e |
| 3.8 | Samples as one-click demo projects on home; docs complete; roadmap page; release | all | checklist |

## Parallelism guide for agent threads
- M0: 0.1 first; then 0.2–0.5 in parallel; then 0.6–0.7.
- M1: 1.1/1.2/1.5/1.7/1.9 in parallel after M0; then 1.3/1.4/1.8; then 1.6/1.10/1.11; 1.12 last.
- M2: 2.1 first; then 2.2/2.3/2.5 in parallel; then 2.4/2.6/2.7.
- M3: 3.1 first; then 3.2/3.3/3.5/3.6/3.7 in parallel; then 3.4; 3.8 last.
