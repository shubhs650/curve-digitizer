# Changelog

All notable user-visible changes. Format: Keep a Changelog; versioning: SemVer (0.x during rev 0).

## Unreleased

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
