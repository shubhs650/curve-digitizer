# Changelog

All notable user-visible changes. Format: Keep a Changelog; versioning: SemVer (0.x during rev 0).

## Unreleased

## [0.3.0] - 2026-10-31

Milestone M3, fitting and extras, completing rev 0: curve fitting with recommendations, code export in six languages, the calculator, the reference overlay, the error reporter, the Excel workbook v2 and the samples as one-click demo projects. Still entirely in the browser and offline.

### Acceptance (docs/ACCEPTANCE_TARGETS.md, the full rev 0 list)

Measured on Chromium (the target, ADR 36) on a CI-class machine unless noted. The Playwright suite also runs on Firefox and WebKit in CI.

| Target | Result | How |
|---|---|---|
| A1 calibration residual ≤ 0.3 px | pass | `test:samples` (vector-clean, sn-family) |
| A2 snapped manual pick ≤ 0.5 px RMS | pass | `test:samples` replay, and through the UI in e2e |
| A3 guided trace ≤ 1.0 px (vector-clean), ≤ 2.0 px (scan-tilted) | pass: 0.07–0.10 px and 0.07–0.15 px | `test:samples` |
| A4 sn-family crossings, no wrong branch, no prompt | pass | `test:samples` |
| A5 colour mask ≥ 98 % of curve length | pass: 100 % | `test:samples` |
| A6 X-step ≤ 0.5 px RMS, 0 outliers | pass: 0.04–0.09 px | `test:samples` |
| A7 recommendation picks the ground-truth family | pass on all 32 synthetic fixtures (power, exp, poly-3, piecewise; linear, semi-log and log-log); 99.4 % of 1120 random draws | unit; `scripts/fit-recommend-mc.ts` |
| A8 generated code within 1e-9 of the app at 50 X values | pass on 487 fits: JavaScript, Python (NumPy) and C executed, worst 4.2e-15; Excel formula through the evaluator, worst 4.3e-10; the workbook's Fit sheet formulas, worst 4.2e-15. VBA and MATLAB by golden text; **manual spot check still to do** | unit (CI runs Python and C) |
| A9 uncertainty present, positive, ≥ 0.5 px-equivalent | pass | unit |
| P1 cold load ≤ 2 s; shell ≤ 1.5 MB gzip | 555 ms to interactive; shell 377 kB gzip | e2e; size check |
| P2 PDFium lazy, ≤ 15 MB | pass: not requested before the first PDF; 4.8 MB | e2e; size check |
| P3 600-DPI crop ≤ 1.5 s | 241 ms for 5613 × 3966 px | e2e timing |
| P4 2000 px trace ≤ 1 s, progress ≥ 4/s | pass on Chromium (341–603 ms); Firefox and WebKit within 2 s at ≥ 2/s (ADR 36) | e2e timing |
| P5 no long task > 100 ms | pass for manual ops, the tracers, fitting and the Excel export | e2e `PerformanceObserver('longtask')` |
| P6 Excel workbook with chart and image ≤ 2 s (4 datasets) | 379 ms | e2e timing |
| P7 1000-page PDF + 5 crops, JS heap < 500 MB | 72 MB page heap | e2e `performance.memory` |
| R1 full workflow offline | pass | e2e |
| R2 `.cdz` round-trip | pass | e2e and unit |
| R3 autosave ≤ 5 s, restore after a killed tab | pass | e2e |
| R4 Chrome/Edge, Firefox, Safari | pass on Chromium, Firefox and WebKit in CI; Chromium is the main target and the app says so | Playwright matrix |
| R5 PDFium failure → image-only mode | pass | e2e |
| R6 passwords and permissions | pass | e2e |
| R7 50 Mpx pixel budget | pass | unit and e2e |
| U1 first-time user PDF → CSV < 3 min (2 colleagues) | **not yet run** | manual |
| U2 everything by keyboard; complete cheat sheet | automated part passes; the keyboard-only walkthrough is **still to do** | e2e, unit, manual |
| U3 undo/redo for every command | pass | unit invert test per command |
| U4 WCAG AA, light and dark | pass | axe in Playwright |

### Added

- Samples as demo projects: **Try a sample** on the home screen opens any of the four bundled samples (pump curves, a 1970s scan, an S-N family, a dark chart) in one click as a new project, calibrated, with an empty dataset per curve. They load from the app itself and work offline.
- Roadmap page in the docs, listing the rev 1 candidates.
- Fit tab in the dock under the canvas: **Recommend fits** tries polynomials (degree 1–9), power, exponential, logarithmic, rational, cubic spline, monotone (PCHIP) spline and piecewise linear models, ranks them by AICc and recommends the simplest one the points support; or pick a model and its degree, order, knots or breakpoints yourself. Fits are made on the log of the values on log axes, leave out excluded points, run off the main thread with progress and Cancel, and show a residual plot. The kept fit is drawn over the image (the candidate being previewed dashed), fills the table's Residual column, and says when its points have changed since. Docs page "Fitting curves".
- Code export for a kept fit: **Code** shows it in Python (NumPy), JavaScript, an Excel formula, a VBA function, MATLAB/Octave and C/C++, each with a comment giving the model, the valid X range and the fit statistics; splines and piecewise lines come as a knot table plus an interpolation snippet. Copy or download; every language agrees with the app within 1e-9 (A8).
- Calculator tab in the dock: type X values to read Y for every function dataset, from its fit (extrapolation marked) or between its points on the chart's paper; **Compare** adds A − B and A / B for two datasets; **Copy results** copies the table as tab-separated text. Docs page "Calculator and comparing curves".
- Reference overlay: lay an image file, or a crop of a PDF page (**Use as reference**), over a graph to compare editions or crops, with opacity and offset. A viewing aid, not saved with the project.
- Error reporter: error messages, a failed trace and the crash screen offer **Report…**, which shows the error, version, browser and step for review, optionally with the anonymized project, then opens a prefilled GitHub issue or copies the text. Nothing is sent from the app.
- Excel workbook v2: each Data sheet has a chart of the points and fits and the graph image; a Fit sheet holds every kept fit's parameters in named cells with live formulas over its valid range (change x or a coefficient and the values and chart follow); a VBA sheet has each fit as a function; the Project sheet summarises the fits.

## [0.2.0] - 2026-10-31

Milestone M2, smart tracing: pre-processing filters with an "Enhance for tracing" preset, the guided tracer, the colour mask, X-step sampling and per-point uncertainty from the measured line width. Still entirely in the browser and offline.

### Acceptance (docs/ACCEPTANCE_TARGETS.md, M2)

| Target | Result | How |
|---|---|---|
| A3 guided trace ≤ 1.0 px RMS on vector-clean, ≤ 2.0 px on scan-tilted | pass: 0.07–0.10 px (vector-clean), 0.07–0.15 px (scan-tilted), 100 % coverage | `test:samples` |
| A4 sn-family intersections crossed, no wrong branch, no prompt | pass: 2 intersections per curve, 0 wrong-branch points, no prompt | `test:samples` |
| A5 colour mask recovers ≥ 98 % of curve length on vector-clean | pass: 100 % of each curve | `test:samples` |
| A6 X-step at 25 X values on vector-clean ≤ 0.5 px RMS, 0 outliers | pass: 0.04–0.09 px, 0 outliers | `test:samples` |
| A9 uncertainty present, positive, ≥ 0.5 px-equivalent for every point | pass, including rows averaged from points at one X | unit |
| P4 guided trace of a 2000 px curve ≤ 1 s, progress ≥ 4/s | pass on Chromium: 341 ms, about 15 progress events/s; Firefox and WebKit within the 2 s allowed by ADR 36 | e2e timing |
| P5 no main-thread long task > 100 ms (tracing) | pass for the guided trace, colour mask and X-step runs | e2e `PerformanceObserver('longtask')` |

Also replayed on every sample as regression checks: the `dark-bg` traces (0.04–0.05 px RMS) and calibrations, and the line width each tool measures (median within 0.5 px of the drawn width).

Manual items carried over from M1: U1 (two first-time users, PDF to CSV in under 3 minutes) **not yet run**; U2 automated part passes (the new T, M and X tools are in the cheat sheet and the docs page, and the keyboard crosshair clicks with whichever canvas tool is active), the keyboard-only walkthrough is still to do; P7 passed in 0.1.0 (57 MB) and is re-run by the e2e suite.

### Added

- Pre-processing panel in the inspector: a stack of filters for the tracers (brightness, contrast with auto stretch, grayscale, invert, threshold, despeckle, grid-line suppression that copes with tilted scans, isolate colour), the one-click "Enhance for tracing" preset, a live before/after preview computed off the main thread, and an "Add Invert" suggestion on dark-background charts. Docs page "Pre-processing".
- Guided trace tool (T): click the start of a curve and where to stop (or trace it to its ends); the trace follows the curve through crossings, grid lines and gaps off the main thread with progress and Cancel, asks which way to go where the curve splits, and adds points at an adjustable spacing in one step. The eyedropper colour can be applied to the dataset.
- Colour mask tool (M): click a curve to find every curve of its colour, tune the colour tolerance, keep or drop the curves found, and add points along the kept ones in one step. Runs off the main thread with progress and Cancel.
- X-step tool (X): enter a step (From, To, Step) or a list of X values, click a curve, and get one point at each X, read along the traced curve through the calibration. Outliers are drawn red and added excluded from fits; X values the curve does not reach are reported. Runs off the main thread with progress and Cancel.
- Uncertainty: the σx/σy columns of the data table and the `sigma_x`/`sigma_y` export columns now use the line width measured by the guided trace, colour mask and X-step as well as by snap, and the column headers explain how σ is worked out. Docs: "Uncertainty" in the data table page.

### Changed

- Points of a function dataset averaged into one export row (same X) no longer get an uncertainty below the half-pixel resolution of one point.
- A project file with a negative point line width is refused when opened, instead of failing at export.

## [0.1.0] - 2026-10-31

First release (milestone M1, manual core): open a PDF or image, crop, calibrate, digitize by hand with magnetic snap, edit in the data table, export CSV/Excel/audit JSON, and keep projects on this device or in `.cdz` files. Runs entirely in the browser and works offline.

### Acceptance (docs/ACCEPTANCE_TARGETS.md, M1)

| Target | Result | How |
|---|---|---|
| A1 calibration residual ≤ 0.3 px | pass | `test:samples` (vector-clean, sn-family) |
| A2 snapped manual pick ≤ 0.5 px RMS | pass | `test:samples` replay, and through the UI in e2e |
| P1 cold load ≤ 2 s; shell ≤ 1.5 MB gzip | 0.55 s to interactive (Chromium, CI-class machine); shell 292 kB gzip | e2e `acceptance.spec.ts`; size check |
| P2 PDFium lazy, ≤ 15 MB | pass: not requested before the first PDF; 4.8 MB | e2e network assertions; size check |
| P3 600-DPI crop ≤ 1.5 s | 0.24–0.89 s render | e2e timing |
| P7 1000-page PDF + 5 crops, JS heap < 500 MB | 57 MB page heap (Chromium; the render worker's memory is not included) | e2e `memory.spec.ts` with `performance.memory` |
| R1 full workflow offline after one PDF open | pass | e2e: reload offline, crop, calibrate, add points, export CSV |
| R2 `.cdz` round-trip | pass | e2e and unit |
| R3 autosave ≤ 5 s, restore after a killed tab | pass | e2e |
| R4 Chrome/Edge, Firefox, Safari | pass on Chromium, Firefox and WebKit; Chromium is the main target and the app says so | Playwright matrix in CI |
| R5 PDFium failure → image-only mode | pass | e2e with the WASM blocked |
| R6 passwords and permissions | pass | e2e fixtures |
| R7 50 Mpx pixel budget | pass | unit and e2e |
| U1 first-time user PDF → CSV < 3 min (2 colleagues) | **not yet run**: needs two people new to the app | manual |
| U2 every action by keyboard; cheat sheet complete | automated part passes: points placed with the keyboard crosshair alone, and a test keeps the cheat sheet and the docs page identical; the manual keyboard-only walkthrough is still to do | e2e, unit, manual |
| U3 undo/redo for every command | pass | unit invert test per command |
| U4 WCAG AA, light and dark | pass | axe in Playwright, all three browsers |

### Added
- "Ready offline" in the header: "Ready offline for images" once the app is saved in the browser, "Ready offline" once PDF support is saved too (the first time a PDF is opened).
- The home screen says the app works best with Chromium browsers (Chrome, Edge).
- Getting started: a "1 Crop · 2 Calibrate · 3 Digitize · 4 Export" checklist in the sidebar ticks each step as you do it and says what to do next, with buttons for the calibrate and add points tools. Hide it with its close button; "Show the getting-started guide" brings it back.
- Keyboard shortcuts: press ? (or Shortcuts in the header) for a cheat sheet of every shortcut. Every canvas tool works without a mouse: with the canvas focused, Enter shows a crosshair, the arrow keys move it 1 px (Shift: 10 px), Enter clicks with the current tool and Esc hides it.
- Docs at /docs: getting started, PDFs and images, calibration, digitizing, the data table, export, projects and .cdz files, and keyboard shortcuts. They load only when opened and work offline.
- Project files: "Save .cdz" in the sidebar (or Ctrl+S) saves the project, with every graph image and optionally its source PDFs, as one portable file; open a `.cdz` with the file picker, by dropping it on the window or from the installed app's "Open with". Opening a file of a project already on this device adds it as a copy, so nothing is overwritten. A project saved without its PDFs says how to re-attach one: open the same PDF again.
- Crash recovery: every change is saved on this device as you work, and the app reopens the project you had open after a reload, a closed tab or a crash.
- Data table in the bottom dock: the shown graph's active dataset, one row per point, updated live as points are added, moved or deleted. Values are shown at the precision the calibration resolves, with σ, pixel position, origin and an Excluded checkbox (the Residual column fills in once fitting arrives). Click a row to select its point (Shift/Ctrl+click for more); a point selected on the canvas scrolls into view. Move with the arrow keys; Enter, F2, a double-click or typing a number edits X, Y or the pixel position in place (Enter or Tab commits, Esc cancels), and the point moves to match. "Copy table" (or Ctrl+C for the selected rows) puts tab-separated rows at full precision on the clipboard, ready to paste into Excel. Every edit is undoable; long traced datasets stay fast because only the visible rows are drawn.
- Crop PDF pages into graphs: click a page in the sidebar to show it in the canvas, drag a rectangle around the graph (or take the whole page), choose the resolution (150–600 DPI, 300 by default) and turn it in quarter turns, then "Crop to new graph". Only that region is rendered, so vector figures come out sharp. A crop that would exceed 50 megapixels is rendered at the highest DPI that fits, and the panel says which before you crop. The Source section of a cropped graph shows its page and DPI and can re-render it at a higher DPI; points and calibration move with the image, and undo goes back to the previous render.
- Manual digitizing: the Add points tool (P) places a point on the active dataset with each click (a first dataset is created if there is none). Magnetic snap (S, on by default, radius in the Points panel) moves the click onto the centre of the nearest curve stroke within reach, to a fraction of a pixel, and ignores light grid lines. Select points by clicking, Shift/Ctrl+click or dragging a box (select tool, V), Ctrl+A for all; drag to move, arrow keys nudge 1 px (Shift: 0.1 px), Delete removes, Esc clears the selection. Every change is undoable. The Points panel shows the selected point's pixel and calibrated position.
- Calibration (C, or the Calibration section of the inspector): click two known ticks on each axis and type their values; linear or log₁₀ per axis, with labels and units. Where the axes cross is solved from the four clicks unless you type it. Affine by default, projective for photos taken at an angle. Shows the residual in pixels and in data units, the digitization resolution (units per pixel), and warnings for clicks too close together, skewed axes or a high residual; draws the calibrated grid back onto the image at the typed ticks. Markers can be dragged to fine-tune them, every change is undoable, and the cursor readout shows calibrated X and Y.
- Open PDFs (file picker, drop, or "Open with"): each PDF is kept in the project on this device and its pages are listed with thumbnails in the sidebar. PDF support loads only when the first PDF is opened. Password-protected PDFs ask for the password (never saved, so a reopened project asks again) and say when it is wrong; PDFs whose author forbids copying content can be viewed but not cropped. If PDF support cannot be loaded, the app says so and keeps working with images.
- Export menu: CSV in long (dataset, parameter, x, y, uncertainties, flags) and wide (one column per dataset) form for the shown graph, an Excel workbook with a Data sheet per graph and a Project sheet (axes, calibration points and residual, datasets), and the audit JSON with SHA-256 references to every graph image. CSV opens correctly in Excel (UTF-8) and carries the axis units, family parameters and source references as header comments.
- Datasets panel in the inspector: add one dataset per curve (colours assigned from a colour-blind-safe palette), and give each a name, colour, mode (function y = f(x) or path in pick order), family parameter (e.g. Temperature = 300 °C), X/Y units, source reference and notes. Every change is undoable with Ctrl+Z / Ctrl+Y or the undo/redo buttons on the tool rail.
- Graph canvas: zoom with the mouse wheel (about the cursor), the +/− keys or the zoom bar; 0 fits the image, 1 shows actual size. Pan with the pan tool (H), the middle mouse button, Space + drag or the arrow keys. A loupe (L) magnifies the pixels under the cursor with a crosshair, and the cursor position is shown in image pixels. Digitized points are drawn over the original image in their dataset colour and highlight under the cursor.
- Open graph images (PNG, JPEG, WebP) with the file picker, by dropping them anywhere on the window, by pasting with Ctrl+V, or from the installed app's "Open with". Each image becomes a graph in a project; projects are saved on this device (origin private file system) and listed on the home screen, where they can be reopened or deleted.
- Installable app that works offline after the first visit, opens `.cdz` projects and PNG/JPEG/WebP images from the operating system, and offers "New version available — Reload" when an update is ready (it never reloads by itself).
- Strict Content Security Policy: the app can only talk to its own origin.
- App shell: header with OET home, Docs, Report issue (prefilled with version and browser) and GitHub links; empty project sidebar, tool rail, canvas, inspector and collapsible data dock; light theme by default with a dark theme toggle.
