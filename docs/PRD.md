# Curve Digitizer — Product Requirements Document

**Product:** Curve Digitizer (part of Open Engineering Tools)
**URL:** https://curve-digitizer.openengtools.com
**License:** MIT · **Status:** Rev 0 in development · **Doc version:** 1.0 (2026-10-30)

---

## 1. Purpose

Curve Digitizer turns a graph printed in a PDF or image into numbers an engineer can defend. Engineers in EPC, mechanical and civil work constantly need values from published curves — ASME fatigue curves, allowable-stress-vs-temperature plots, pump curves, Moody charts, vendor catalog data — that exist only as figures in codes, standards, papers and datasheets. Existing tools (WebPlotDigitizer and clones) work on screenshots, degrade on scanned archives, and produce point lists without any provenance.

Curve Digitizer differs in three ways:

1. **PDF-first.** Open the PDF, pick the page, crop the figure, and the tool re-renders *that region* at high DPI (PDFium). Vector figures become essentially lossless; scans become as crisp as the scan allows.
2. **Traceable by design.** Every number carries its calibration, its pick points, the axis transform, its fit, its valid range and an uncertainty estimate. A checker can open the project and see exactly how each value was obtained.
3. **Engineer-ready outputs.** Not just CSV: an Excel workbook with working formulas and a chart, equations ready to paste into Python/JS/Excel/VBA/MATLAB/C, an interpolation calculator, and curve-family tables ready for 2-D interpolation.

Everything runs in the browser. No login, no cookies, no telemetry, no server-side processing. The source is MIT on GitHub.

## 2. Users

| Priority | Persona | Needs | Non-needs |
|---|---|---|---|
| **Primary** | Practicing engineer (EPC, mechanical, civil) pulling design curves from codes, catalogs, datasheets | Log axes, skew correction on scans, specific-X sampling, uncertainty, Excel with formulas, a provenance record for QA | "Magic" automation that hides how a number was obtained |
| **Secondary** | Researcher / grad student extracting many curves per figure from papers | Curve families, batch-ish workflow within a project, clean CSV, code-ready equations | Bar/pie charts, date axes (rev 1) |
| Tertiary | Data scientist / general user | Quick image → equation | Served incidentally; not a design target |

The tool is desktop-first. It must remain usable at tablet width but no touch-specific gestures are built in rev 0.

## 3. Goals and success criteria

Rev 0 is "done" when every item in `docs/ACCEPTANCE_TARGETS.md` passes. Headline goals:

- A first-time user goes from "open PDF" to "CSV downloaded" for a simple chart in under 3 minutes using only the guided-mode checklist.
- Manual digitization accuracy ≤ 0.5 px RMS against ground truth on the sample set; auto-trace ≤ 1 px RMS on clean vector charts, ≤ 2 px on scans; zero wrong-branch crossings on the S-N family sample without user intervention.
- No main-thread stall > 100 ms during any operation; image-only cold load ≤ 2 s; PDFium payload lazy-loaded and ≤ 15 MB.
- Full offline operation after first load; lossless `.cdz` round-trip; crash-recovery autosave within 5 s of the last edit.

## 4. Scope — Rev 0

### 4.1 Inputs
- PDF files (PDFium via EmbedPDF headless, lazy-loaded on first PDF open).
- PNG/JPG/WebP files, drag-drop, file picker, and clipboard paste.
- PWA installable; registered as a file handler for `.cdz` and images (PDF handler optional, must not conflict with PDF Tools).

### 4.2 PDF workflow
- Page thumbnail sidebar; render pages on demand at screen DPI.
- Drag a crop rectangle on a page → the tool re-renders *only that rectangle* at the user-chosen DPI (default 300, up to 600, auto-capped by a pixel budget) → the crop becomes a Graph in the project.
- The Graph records page index, PDF-space rectangle, DPI and rotation, so it can be re-rendered later ("Re-digitize at higher DPI") and so vector-path extraction can be added in rev 1 without a schema change.
- 90° rotation steps for sideways pages. Fractional skew is handled by calibration, not by rotating pixels.
- Guardrails: warn above 200 MB file size; cap render DPI so a crop stays under 50 Mpx and say so; keep at most N rendered pages cached; keep PDF bytes in OPFS rather than the JS heap; honor passwords/permissions like Adobe Reader (no bypassing); if PDFium WASM fails to load, fall back to image-only mode with a clear message.

### 4.3 Calibration
- Axis types: linear and log10, independently per axis.
- Four-point calibration (two known values per axis) solving an affine (default) or projective transform, which corrects tilt and skew from scans.
- Feedback: transform residual in px and in data units; warnings for collinear/too-close points and for skew above a threshold; calibrated grid overlay drawn back onto the image at user-entered tick values; "Digitization resolution ≈ X units/px" summary.

### 4.4 Manual digitizing
- Click to place, drag to move, delete; multi-select; undo/redo (Ctrl+Z / Ctrl+Y) for every project mutation.
- Magnifier loupe following the cursor with crosshair and live calibrated X,Y readout.
- Keyboard nudge: arrow keys 1 px, Shift+arrows 0.1 px, on the selected point(s).
- Magnetic snap (toggleable, radius adjustable): click near a curve → point snaps to the local curve centerline.
- X-step mode: user enters a step or a list of X values; the tool walks the selected curve and samples Y at exactly those X's; user corrects outliers.

### 4.5 Auto-trace
- **Guided tracing (default):** user clicks a start point (optional end point); a cost-map path search follows the curve using color similarity, continuity and smoothness terms, bridges dashed-line gaps, and pauses at ambiguities (e.g. crossings) to ask "which branch?". Runs in a worker with progress and cancel.
- **Color-mask mode:** eyedropper picks the curve color, tolerance slider, extract matching pixels, thin to a centerline, order into a path.
- Eyedropper sets the dataset's display color by default.

### 4.6 Pre-processing (non-destructive)
- Stackable, live-preview filters recorded in the project: brightness/contrast, grayscale, invert, threshold, despeckle (median), grid-line suppression (long horizontal/vertical run detection + mask), isolate-color.
- One-click "Enhance for tracing" preset (grayscale → despeckle → grid suppression → contrast stretch) with before/after.
- Points are always displayed over the *original* pixels; processed pixels feed the tracer only.

### 4.7 Datasets
- Per graph: many datasets. Per dataset: name, color (10-color colorblind-safe palette assigned in order + custom picker), family parameter (name + value, e.g. T = 300 °C), X/Y units, source reference ("ASME VIII-2 Fig 3-D.1"), notes.
- Modes: `function` (y = f(x): sort by X, merge duplicate X by averaging, warn when multi-valued) and `path` (ordered as picked; for loops/hysteresis; function fits disabled, parametric spline offered; X-step disabled).
- Per point: pixel position, calibrated value, uncertainty, flags `excludedFromFit`, `outOfRange`.

### 4.8 Fitting and equations
- Models: polynomial (deg 1–9), power law, exponential, logarithmic, rational (low order), cubic spline, monotone (PCHIP) spline, piecewise linear with user/auto breakpoints.
- Fitting is performed in calibrated space and in log space for log axes, so a power law on log-log paper is a straight-line fit.
- "Auto-recommend" fits all candidates and ranks by AICc (not raw R²); shows top 3 with residual plots; warns on overfitting oscillation and on extrapolation beyond the digitized X range.
- Every exported equation carries the valid X range, model, coefficients, R², RMSE and AICc as comments.
- Code export: Python (NumPy), JavaScript, Excel formula, VBA function, MATLAB, C/C++. Spline/piecewise exports as knot table + interpolation snippet.

### 4.9 Project and persistence
- A Project holds many Graphs; a Graph holds a source (image or PDF crop), pre-processing stack, calibration, datasets, fits.
- Autosave to OPFS/IndexedDB; project list on the home screen; crash-recovery autosave ≤ 5 s after last edit.
- Portable `.cdz` (zip): versioned `project.json` + cropped images (+ optional embedded source PDF). Opens by drag-drop or file handler. Lossless round-trip is an acceptance target.
- Plain-JSON "audit export": every calibration pixel, every point, the transform, fit parameters — a human-readable provenance record.
- See `docs/PROJECT_SCHEMA.md`.

### 4.10 Exports
- CSV per graph: wide table (common X grid, one column per dataset) and long table (`param,x,y,uncertainty`), header comment lines with units and source.
- Excel workbook: `Data` sheet(s), `Project` metadata sheet (calibration, units, source, fit summary), `Fit` sheet with live formulas and named coefficient ranges (polynomial via `SUMPRODUCT`, power/exp via direct formula, splines via lookup table + `XLOOKUP`/`FORECAST.LINEAR` interpolation), `VBA` sheet with the equivalent function text, embedded chart of points + fit, and the source crop image.
- JSON (same structure as audit export). Copy table to clipboard.

### 4.11 UI
- Fluent 2 design language, light theme default (dark available), Microsoft Fluent System Icons (MIT).
- Layout: collapsible project/pages sidebar (far left) → tool rail (left) → canvas (center) → inspector (right) → collapsible bottom dock (live editable data table, fit panel).
- Dismissible first-run guided-mode checklist (1 Crop · 2 Calibrate · 3 Digitize · 4 Export) instead of a wizard.
- Keyboard-first: shortcut cheat sheet (`?`); dark-background detection suggests Invert.
- Extras: compare-curves readout (difference/ratio at a given X), interpolation calculator panel (type X → Y for every dataset/fit, copyable), reference overlay (load a second crop, overlay semi-transparent), re-digitize at higher DPI.
- Header buttons: OET Home (openengtools.com), Docs, Report issue (GitHub issue template prefilled with version/browser/step), GitHub repo.
- In-app opt-in error reporter: on crash or failed trace, show the error + environment + (optionally) anonymized project JSON; user reviews, then it prefills a GitHub issue or copies the text. No automatic sending.

### 4.12 Docs
- Static `/docs` route rendered from Markdown in the repo.
- 3–4 bundled sample projects (clean vector chart, tilted 1970s scan, log-log S-N family, dark-background chart) loadable in one click from the home screen; they double as CI regression fixtures with expected outputs.
- Roadmap page listing rev-1 candidates.

## 5. Non-goals (Rev 0)

Cloud sync and accounts · touch-specific UI · ML-based tracing · bar/pie/polar/ternary plots · map/georeferenced images · date-time axes · OCR of axis labels · zero-click curve detection · batch processing of many PDFs · 3D/surface plots · vector-path extraction (designed-for, deferred) · collaborative review/comments · versioned project history · plugin/API for third-party fit models · share-by-URL · "paste your own equation" importer · Markdown/PDF report.

## 6. Constraints

- Everything processed in the browser; no network calls after load except fetching the app's own assets. No analytics, no cookies.
- Hosting: Cloudflare Pages (static) on the subdomain above; must work offline after first load (core-first load, background download of PDFium module with a "Ready offline" indicator).
- Licensing: MIT; dependencies must be MIT/BSD/Apache-compatible (PDFium BSD-3, EmbedPDF MIT). No AGPL code.
- Browser support: current Chrome, Edge, Firefox, Safari.
- Must honor PDF passwords and permissions.

## 7. Milestones

See `docs/MILESTONES.md`. Summary:

- **M1 — Manual core** (target: OET launch, mid-Nov 2026): inputs, PDF crop with high-DPI re-render, calibration (linear/log/skew) with residual feedback, manual picking with loupe/snap/nudge, data table, CSV + basic XLSX, `.cdz` + autosave, undo/redo, docs skeleton.
- **M2 — Smart tracing**: guided + color-mask auto-trace, X-step, pre-processing stack + preset, uncertainty, grid replot overlay.
- **M3 — Fitting & extras**: fit models + AICc ranking, code export, Excel formulas/charts/image, calculator panel, compare readout, reference overlay, samples as CI fixtures, full docs, error reporter.

Each milestone ships publicly with a changelog and its subset of acceptance targets.

## 8. Open questions

None blocking. Decisions log lives in `docs/DECISIONS.md`; new questions go there as ADR entries.
