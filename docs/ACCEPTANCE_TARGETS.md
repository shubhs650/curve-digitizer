# Acceptance targets

A milestone is done only when every target tagged with it passes in CI (automated) or in the release checklist (manual). Tolerances are measured against `samples/` ground truth. "Mid laptop" = 4-core, 8 GB, Chrome, no GPU acceleration assumed.

## Accuracy

| ID | Target | Milestone | How verified |
|---|---|---|---|
| A1 | Calibration RMS residual ≤ 0.3 px on `samples/vector-clean` and `samples/sn-family` | M1 | `test:samples` |
| A2 | Manual pick, snapped: ≤ 0.5 px RMS from ground-truth centerline on `vector-clean` | M1 | `test:samples` (replay recorded clicks) |
| A3 | Guided trace: ≤ 1.0 px RMS on `vector-clean`; ≤ 2.0 px RMS on `scan-tilted` | M2 | `test:samples` |
| A4 | Guided trace crosses every intersection on `sn-family` without a wrong branch and without a user prompt | M2 | `test:samples` |
| A5 | Colour-mask trace recovers ≥ 98 % of curve length on `vector-clean` | M2 | `test:samples` |
| A6 | X-step sampler at 25 X values on `vector-clean`: ≤ 0.5 px RMS, 0 outliers | M2 | `test:samples` |
| A7 | Fit recommendation picks the ground-truth model family on all synthetic fixtures (power, exp, poly-3, piecewise) | M3 | unit |
| A8 | Code export: Python/JS/Excel/VBA/MATLAB/C snippets evaluate within 1e-9 relative of the in-app fit at 50 X values | M3 | unit (JS/Python executed in CI; Excel via formula evaluator; VBA/C/MATLAB by generated-text golden + manual spot check) |
| A9 | Uncertainty column is present, positive, and ≥ 0.5 px-equivalent for every point | M2 | unit |

## Performance

| ID | Target | Milestone | How verified |
|---|---|---|---|
| P1 | Cold load (image-only use) ≤ 2 s to interactive on mid laptop; app shell ≤ 1.5 MB gzip | M1 | Playwright + size script |
| P2 | PDFium chunk lazy-loaded, ≤ 15 MB, never requested until first PDF open | M1 | Playwright network assertions |
| P3 | 600-DPI crop render of a ≤ 50 Mpx region ≤ 1.5 s | M1 | Playwright timing |
| P4 | Guided trace of a 2000 px-wide curve ≤ 1 s with progress events ≥ 4/s | M2 | Playwright timing |
| P5 | No main-thread long task > 100 ms during any operation on the samples | M1 (manual ops) / M2 (trace) / M3 (fit, export) | `PerformanceObserver('longtask')` in e2e |
| P6 | Excel export with chart + image ≤ 2 s for a 4-dataset graph | M3 | Playwright timing |
| P7 | Memory: opening a 1000-page PDF and cropping 5 pages keeps JS heap < 500 MB | M1 | manual + `performance.memory` where available |

## Robustness / offline

| ID | Target | Milestone | How verified |
|---|---|---|---|
| R1 | Offline proof: after first load and one PDF open, reload in airplane mode and complete the full workflow | M1 | Playwright `context.setOffline(true)` |
| R2 | `.cdz` round-trip: export → reopen → `project.json` deep-equal (ignoring `modified`) and images byte-equal | M1 | e2e |
| R3 | Crash-recovery autosave ≤ 5 s after last edit; killing the tab and reopening restores the project | M1 | e2e |
| R4 | Works in current Chrome, Edge, Firefox, Safari | M1 | Playwright matrix (WebKit for Safari) |
| R5 | PDFium load failure → image-only mode with message; all image-only tests still pass | M1 | e2e with WASM blocked |
| R6 | Protected PDF: wrong password → clear error; permission-restricted → honoured | M1 | e2e fixture |
| R7 | Pixel budget: crop that would exceed 50 Mpx is capped and the user is told the effective DPI | M1 | unit + e2e |

## UX

| ID | Target | Milestone | How verified |
|---|---|---|---|
| U1 | First-time user: open PDF → CSV in < 3 min using only the guided checklist (2 colleagues) | M1 | manual, recorded in release notes |
| U2 | Every action reachable by keyboard; cheat sheet lists all shortcuts | M1 | manual checklist |
| U3 | Undo/redo works for every mutation listed in `packages/core/src/commands/` | M1 | unit (each command has an invert test) |
| U4 | Light and dark themes both pass WCAG AA contrast on primary surfaces | M1 | axe in Playwright |

## Release checklist (per milestone)
- [ ] All CI gates green on `main`
- [ ] Manual targets (U1, U2, P7) recorded in `CHANGELOG.md`
- [ ] Version bumped, tag pushed, Cloudflare Pages deploy verified at the subdomain
- [ ] "Ready offline" verified on a fresh browser profile
