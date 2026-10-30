# Decisions log (ADR style)

One entry per decision. Agents: when you make a non-trivial choice that is not already here, append an entry and reference it in your PR. Never silently reverse an entry; add a superseding one.

| # | Date | Decision | Why | Alternatives rejected |
|---|---|---|---|---|
| 1 | 2026-10-30 | Primary user is the practicing engineer; researcher second | Keeps traceability the governing principle; matches OET audience | Equal weight to general users (pushes toward opaque automation) |
| 2 | 2026-10-30 | Axes: linear + log10 per axis; 4-point affine/projective calibration correcting skew | Engineering charts are frequently log; scanned PDFs are tilted | Linear-only; polar/ternary/date (rev 1) |
| 3 | 2026-10-30 | PDF via PDFium (EmbedPDF headless), crop re-rendered at high DPI; record page + PDF-space rect | Lossless on vector figures; enables rev-1 vector extraction | pdf.js (fidelity, no vector path); figure auto-detection (deferred) |
| 4 | 2026-10-30 | Manual UX: loupe, keyboard nudge, toggleable magnetic snap, X-step mode | Engineers want Y at specific X; snap must be off-able on noisy scans | Click-only |
| 5 | 2026-10-30 | Auto-trace: guided cost-map path search (default) + colour-mask mode; no ML in rev 0 | Handles crossings/dashes/grids; keeps the user in the loop; deterministic | ONNX segmentation (heavy, non-deterministic) |
| 6 | 2026-10-30 | Fits: closed-form family + splines/piecewise; AICc ranking; fit in log space for log axes; exports carry range + stats | Design curves rarely have a closed form; AICc prevents over-fitting theatre | Polynomial-only; raw R² ranking |
| 7 | 2026-10-30 | Project = autosave (OPFS) + portable `.cdz` zip + audit JSON; zip not rar | Portable, tiny, reproducible; rar has no browser writer | Session-only |
| 8 | 2026-10-30 | Datasets carry family parameter, units, source reference; no dataset groups | Curve families are the norm; tidy long-format export | Groups (UI complexity) |
| 9 | 2026-10-30 | Layout: project sidebar + tool rail + canvas + inspector + bottom dock; guided checklist not wizard; Fluent 2; light default; desktop-first | Consistent with PDF Tools; experts not railroaded | Wizard |
| 10 | 2026-10-30 | Pre-processing: non-destructive recorded stack + one-click preset; points drawn on original | Reviewer must see original; preset for casual users | One-shot destructive enhance |
| 11 | 2026-10-30 | Excel export with live formulas, named ranges, VBA sheet, chart, crop image | "Equation ready for Excel" means a working cell | Data-only sheet |
| 12 | 2026-10-30 | Stack: React+TS+Vite, plain canvas overlay, Comlink workers, OffscreenCanvas, pure-TS math package | No UI freeze; reusable core; consistent with PDF Tools | Konva/Pixi (weight), pdf.js |
| 13 | 2026-10-30 | Uncertainty per point from pixel/line-width resolution; calibration residual + grid replot overlay | Makes numbers citable; catches calibration errors visually | No uncertainty |
| 14 | 2026-10-30 | MIT; opt-in in-app error reporter → GitHub issue; bundled sample projects as CI fixtures; docs static route | Consistent with OET; no telemetry; samples are the best docs and tests | Interactive docs (deferred) |
| 15 | 2026-10-30 | Non-goals list (see PRD §5) | Scope discipline | — |
| 16 | 2026-10-30 | Quantitative acceptance targets (see ACCEPTANCE_TARGETS.md) | "Done" must be measurable | — |
| 17 | 2026-10-30 | PDF guardrails: size warning, pixel budget DPI cap, bounded page cache, OPFS bytes, password honoured, image-only fallback | Huge standards PDFs; keep image-only path testable | No limits |
| 18 | 2026-10-30 | Dataset modes `function`/`path`; exclude-from-fit and out-of-range flags; no auto mode detection | Hysteresis loops must not be sorted; reviewer sees fit inputs | Auto-detect (wrong guesses) |
| 19 | 2026-10-30 | Extras in rev 0: undo/redo, compare readout, keyboard-first, invert suggestion, re-digitize at higher DPI, calculator panel, reference overlay | Cheap, high value for engineers | Share-by-URL, equation importer |
| 20 | 2026-10-30 | Three milestones M1 manual core → M2 tracing → M3 fitting/extras; M1 for OET launch | Credible tool early; independent subsystems release separately | Big-bang rev 0; public preview |
| 21 | 2026-10-30 | Repo private until M1 is accepted, then public on GitHub | Same as PDF Tools | Public from day one |
