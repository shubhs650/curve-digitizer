# UX study: laptop layouts (v0.4.0)

2026-10-31. Trigger: the owner tried v0.3.0 on a laptop and found it unshippable (squashed sidebar buttons, a Data panel taking half the screen, Ctrl/pinch zoom zooming the whole app, a crop rectangle that looked stale). Decisions are recorded as ADR 47 in `docs/DECISIONS.md`.

## Method

The production build of v0.3.0 (main at c37beb9) was driven by Playwright in Chromium at seven viewports, through four states each: home screen, project with a 3-page PDF, crop view with a rectangle dragged, and a freshly cropped graph. A control counts as clipped when it is visible and shorter than 20 px or its content is taller than its box (`scrollHeight > clientHeight`). `apps/web/e2e/layout.spec.ts` now runs the same checks in CI.

| Viewport (CSS px) | Stands for |
|---|---|
| 1280 × 720 | 1920 × 1080 laptop at 150 % Windows scaling (the most common work laptop) |
| 1366 × 768 | Budget 14–15″ laptop |
| 1440 × 900 | MacBook Air 13″ default |
| 1536 × 864 | 1920 × 1080 at 125 % scaling |
| 1920 × 1080 | Desktop monitor |
| 1024 × 768 | Small window, tablet landscape |
| 768 × 1024 | Tablet portrait (not a target, PRD §5, but must not break) |

## Findings (v0.3.0)

S1 blocks or misleads a first-time user, S2 wastes space or looks broken, S3 polish.

| # | Finding | Viewports | Sev. | Cause |
|---|---|---|---|---|
| F1 | All projects, Add PDF, Save .cdz, Export squashed to 12–14 px, text cut | 1280, 1366, 1024 | S1 | Flex column children shrink; Fluent Button clips overflow |
| F2 | Whole page button squashed in the Crop panel | short windows | S1 | Same as F1 |
| F3 | Ctrl+wheel, pinch and Ctrl +/− zoom the whole app on the PDF page | all | S1 | PDF view had no zoom; events reached the browser |
| F4 | PDF page a small fixed picture; no zoom or pan to aim the crop | all | S1 | Fit-to-stage only |
| F5 | Crop rectangle cannot be moved or resized, only redrawn; the dim makes the page look stale | all | S1 | Draw-only overlay |
| F6 | Data dock 230 px (30 % of 768) even with no data | all | S2 | Fixed 200 px body, open by default |
| F7 | Empty tool rail and inspector on the home screen and crop view | all | S2 | Shell always rendered every region |
| F8 | Canvas 45 % of the window at 1366 × 768 with a graph | 1280, 1366 | S2 | F6 + F7 |
| F9 | Project name overlapped by All projects | 1280, 1366 | S2 | F1 |
| F10 | Dock under the inspector cuts the Calibration form short | all | S2 | Dock spanned the whole work row |
| F11 | Flat grey panels, 12 px captions as headings, no brand mark | all | S2 | Bare Fluent defaults |
| F12 | Home: plain text, no drop target, samples without previews | all | S2 | Minimal first pass |
| F13 | Getting-started checklist crowds the sidebar above the graphs | all | S3 | Placed first |
| F14 | Header labels crowd at 768–1024 px | 768, 1024 | S3 | Labels never collapse |

## Conventions followed

From PDF viewers (Acrobat, Edge/Chrome, PDF.js), graph digitizers (WebPlotDigitizer, Engauge, PlotDigitizer) and image editors:

- Ctrl+wheel and pinch zoom the document at the pointer, never the UI; Ctrl + / − / 0 zoom and fit.
- A zoom bar with percentage, fit and actual size; Space-drag or middle-drag pans.
- A crop or marquee has eight handles, moves by dragging inside and shows its size.
- The canvas is the largest thing on screen; side panels collapse; the step guide stays visible but small.
- A clear first step: a large drop zone and sample files with previews.

## Fixes

F1–F10 in the layout PR (ADR 47); F11–F14 in the visual redesign PR. Both ship in v0.4.0.

## Tests that keep it fixed

- `apps/web/e2e/layout.spec.ts` opens the home screen, a crop and a graph at 1280×720, 1366×768, 1440×900, 1536×864, 1920×1080, 1024×768 and 768×1024 and fails on any control narrower or shorter than its content, any clipped label, page scroll, overlapping regions, or a canvas below half the width (or 60 % of the height at 1280 px and wider).
- `apps/web/e2e/visual.spec.ts` compares screenshots of the home screen (1366 light and dark, 768), the crop view (1366) and a graph (1366 with the dock collapsed, 1920 with it open) against baselines, Chromium on Linux, with Liberation Sans forced so CI and local runs render alike. Update baselines with `npx playwright test apps/web/e2e/visual.spec.ts --project=chromium --update-snapshots` after an intended change, and look at the new images before committing.
- Unit tests cover the zoom capture registry, the dock and sidebar defaults, and the crop handle geometry.
