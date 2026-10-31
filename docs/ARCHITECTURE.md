# Curve Digitizer — Architecture

Doc version 1.0 (2026-10-30). Read `docs/PRD.md` first. This document is the contract that `CLAUDE.md` points agents at; change it with an ADR in `docs/DECISIONS.md`.

## 1. Principles

1. **Core before UI.** All math, image processing, tracing, fitting and the project model live in pure TypeScript packages with no DOM dependency and full unit tests. The UI is a thin client.
2. **Main thread never blocks.** Rendering, pre-processing, tracing and fitting run in Web Workers with OffscreenCanvas. Every long operation reports progress and is cancellable.
3. **Traceability is data.** Everything that influenced a number (calibration pixels, transform, processing stack, pick pixels, fit params) is stored in the project model, never recomputed from UI state.
4. **Image-only path always works.** PDFium is an optional, lazy-loaded capability. The app must run, test and build without it.
5. **Non-destructive.** Original pixels are immutable; filters are a recorded stack; points are drawn on the original.
6. **Versioned schema from day one.** `project.json` carries `schemaVersion`; migrations are explicit functions.

## 2. Stack

| Concern | Choice | Notes |
|---|---|---|
| Language / build | TypeScript (strict), Vite, pnpm workspaces | Monorepo |
| UI | React 18+, Fluent UI React v9 (Fluent 2), Fluent System Icons | Light default, dark via theme tokens |
| State | Zustand (UI state) + a command-pattern project store | Undo/redo = command stack; see §6 |
| Canvas | Plain `<canvas>` 2D for overlay; OffscreenCanvas in workers | No scene-graph lib; spatial index (flatbush) for hit-testing |
| PDF | EmbedPDF headless (PDFium WASM), dynamic `import()` | ≤ 15 MB, lazy, cached by service worker after first use |
| Workers | Comlink for RPC | One render worker, one compute worker pool (pre-process/trace/fit) |
| Storage | OPFS (project files, PDF bytes, crops), IndexedDB (project index) | Via `idb-keyval`/light wrapper |
| Zip | fflate | `.cdz` read/write |
| Excel | ExcelJS | Formulas, named ranges, charts, images |
| Math | Own `@cd/math` (linear algebra, least squares, splines, AICc) | Small; tested against SciPy/NumPy fixtures |
| Tests | Vitest (unit), Playwright (e2e + visual), fixtures from `samples/` | CI gates in §9 |
| PWA | vite-plugin-pwa (Workbox), file handlers in manifest | Core-first precache; PDFium runtime-cached |
| Hosting | Cloudflare Pages, static | No functions |

## 3. Repository layout

```
curve-digitizer/
├── apps/
│   └── web/                     # React PWA (UI only)
├── packages/
│   ├── core/                    # project model, commands, schema, migrations, serialization (.cdz, audit JSON)
│   ├── math/                    # transforms, least squares, splines, AICc, uncertainty
│   ├── image/                   # pre-processing filters, grid suppression, color distance, thinning
│   ├── trace/                   # guided cost-map tracer, color-mask tracer, X-step sampler, magnetic snap
│   ├── fit/                     # fit models, ranking, code generators (py/js/xlsx/vba/matlab/c)
│   ├── export/                  # CSV, XLSX (ExcelJS), JSON
│   ├── pdf/                     # EmbedPDF wrapper: open, thumbnails, crop-render at DPI, guardrails
│   └── workers/                 # worker entry points + Comlink interfaces (depends on image/trace/fit/pdf)
├── samples/                     # bundled sample projects + ground truth (also CI fixtures)
├── docs/                        # this folder; also served at /docs by apps/web
├── .github/                     # CI, issue templates
├── CLAUDE.md, README.md, CONTRIBUTING.md, LICENSE
```

Dependency direction: `apps/web → workers → {trace, fit, image, pdf} → {math, core}`. `core` and `math` import nothing from the DOM. `pdf` is the only package allowed to import EmbedPDF.

## 4. Project model (summary)

Full schema in `docs/PROJECT_SCHEMA.md`.

```
Project { id, schemaVersion, name, created, modified, graphs: Graph[] , settings }
Graph   { id, name, source: ImageSource | PdfCropSource, rotation, processing: FilterStep[],
          calibration: Calibration | null, datasets: Dataset[], fits: Fit[], view }
Calibration { xAxis: {type:'linear'|'log10'}, yAxis: {...}, points: CalPoint[4+], model:'affine'|'projective',
              matrix: number[9], residualPx, resolution: {xUnitsPerPx, yUnitsPerPx}, warnings[] }
Dataset { id, name, color, mode:'function'|'path', param?: {name, value, unit}, xUnit, yUnit, sourceRef, notes,
          points: Point[] }
Point   { id, px: [x,y], value: [x,y], sigma: [sx,sy], excludedFromFit, outOfRange, origin:'manual'|'trace'|'xstep'|'snap' }
Fit     { id, datasetId, model, params, domain:[xmin,xmax], stats:{r2, rmse, aicc, n}, space:{x:'lin'|'log', y:'lin'|'log'} }
```

Pixel coordinates are in the *crop's* pixel space at the recorded DPI. Calibrated values are derived from `px` through `calibration.matrix` and axis types; they are cached in `value` for export but `px` is the source of truth.

## 5. Coordinate pipeline

```
PDF page space (pt) --crop rect + DPI--> crop pixel space --calibration matrix--> axis space (lin or log10) --exp if log--> data value
```

- Calibration solves `M` (3×3) from ≥ 4 correspondences: pixel → axis-space (`log10(value)` on log axes). Affine by default (6 dof, least squares); projective (8 dof, DLT) when the user enables it or when affine residual is high.
- Residual in px is reported per calibration point and as RMS. Warnings: points collinear, two points closer than 20 px, skew angle > 3°.
- Uncertainty per point: `sigma = sqrt((0.5 px)^2 + (lineWidthPx/2)^2) * unitsPerPx` propagated through the local Jacobian of `M` (and through `10^x` on log axes). Line width is estimated from the local stroke when the point was snapped/traced, else a default of 2 px.

## 6. Command pattern and undo

Every mutation of a `Project` is a `Command { apply(project), invert(project), label, coalesceKey? }` executed through `ProjectStore.dispatch`. The store keeps undo/redo stacks (cap 200), coalesces consecutive drags by `coalesceKey`, and emits a change event that triggers autosave (written as soon as no write is in flight, changes during a write collapsing into the next; ADR 31). UI never mutates the project directly. This is what makes undo, autosave and audit export trivial.

## 7. Workers

| Worker | Responsibilities | Cancellation |
|---|---|---|
| `render` | Open PDF (bytes from OPFS), page thumbnails, crop-render at DPI with pixel budget, image decode | AbortSignal → PDFium render cancel |
| `compute` pool (n = `hardwareConcurrency-1`, min 1) | Filter stack → processed bitmap; grid suppression; color mask; guided trace; X-step sampling; fits | Cooperative: long loops check a shared `Int32Array` flag every N iterations |

Transfer `ImageBitmap`/`ArrayBuffer` by ownership, never copy. The UI holds only `ImageBitmap` handles for display. Processed bitmaps are cached per `(graphId, hash(filterStack))`.

## 8. Algorithms

### 8.1 Guided trace (cost-map path search)
As built (task 2.3, ADR 34): a colour ink model and a ray-cone corridor search with sub-pixel re-centring; the outline below is the original design it refines.

1. Input: processed grayscale/colour crop, start px, optional end px, target colour (from eyedropper or sampled at start), direction prior (none at start).
2. Cost per pixel = `wc * colorDistance + wt * (1 - thinness)` where thinness comes from a distance transform of the binarized image (penalizes thick blobs and grid intersections).
3. Search: A* / Dijkstra over an 8-connected grid within a corridor around the predicted direction; the predicted direction is a smoothed tangent from the last k accepted points; a turn penalty `wd * angle` keeps crossings going straight through; gap bridging allows up to `g` px of high-cost pixels (dashed lines).
4. Ambiguity detection: when two candidate continuations have cost within `ε` and diverge by > θ, the tracer stops and returns both branches to the UI, which asks the user.
5. Output: ordered px path, simplified with Douglas-Peucker to a tolerance of 0.5 px, then sampled to points (density setting), each with `origin:'trace'` and estimated line width.

### 8.2 Colour-mask trace
Colour distance in CIELAB; threshold → mask; morphological open; Zhang-Suen thinning; connected components; order each component by walking; drop components below a length threshold; user picks components to keep.

### 8.3 X-step sampler
For each requested X: compute the pixel column (through `M`), find curve crossings in the processed image near the previously found Y (continuity), snap to centerline, emit point; mark outliers where the jump exceeds a threshold.

### 8.4 Magnetic snap
Within radius r of the click, find the nearest pixel whose thinness score is a local maximum along the gradient direction; move the point there.

### 8.5 Fitting
Linear least squares via QR for polynomial/log-linearised models; Levenberg-Marquardt for nonlinear (rational); natural cubic spline and PCHIP from standard formulas; piecewise linear with breakpoints from user input or from a change-point heuristic. AICc = `n ln(RSS/n) + 2k + 2k(k+1)/(n-k-1)`. Fits are computed in axis space (log for log axes). Extrapolation warning when a query X is outside `domain`.

## 9. Quality gates (CI)

1. `pnpm lint && pnpm typecheck`
2. `pnpm test` — unit tests in all packages; math fixtures compared to NumPy/SciPy reference values stored in `packages/math/fixtures/`.
3. `pnpm test:samples` — for each sample in `samples/`, replay its recorded operations headlessly and compare outputs to ground truth within the tolerances in `docs/ACCEPTANCE_TARGETS.md`.
4. `pnpm test:e2e` — Playwright: open image → calibrate → place points → export CSV; `.cdz` round-trip equality; offline reload.
5. `pnpm build` — bundle size budget: core app ≤ 1.5 MB gzip, PDFium chunk ≤ 15 MB, enforced by a size check script.
6. Performance smoke: trace a 2000 px curve ≤ 1 s and no long task > 100 ms, measured in Playwright with `PerformanceObserver`.

## 10. Offline and PWA

- Precache: app shell, core chunks, docs, samples. Runtime-cache: PDFium chunk on first PDF open, then "Ready offline" indicator.
- `manifest.json` `file_handlers`: `.cdz`, image types. Service worker update prompt ("New version available — reload").
- No network after load; CSP forbids `connect-src` except `'self'`.

## 11. Error reporting

Global error boundary + worker error channel → dialog with message, stack (sanitized), app version, browser, current step, and an optional anonymized project JSON (images stripped). Buttons: "Open GitHub issue" (prefilled template URL) and "Copy report". Nothing is sent automatically.

## 12. Security and privacy

- No cookies, no analytics, no third-party scripts.
- PDF passwords are used only in-memory for PDFium; never persisted.
- Everything stays in OPFS/IndexedDB on the device; "Clear all data" button in settings.

## 13. Extension points reserved for rev 1

- `PdfCropSource` already records page + PDF-space rect → vector-path extraction.
- `AxisType` enum → date, bar, polar.
- `FitModel` registry → plugin models.
- `Calibration.warnings` and `Point.origin` → OCR-assisted calibration can add `'ocr'`.
