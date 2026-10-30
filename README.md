# Curve Digitizer

**Digitize graphs from PDFs and images — in your browser, with numbers you can defend.**

Part of [Open Engineering Tools](https://openengtools.com) · Live at [curve-digitizer.openengtools.com](https://curve-digitizer.openengtools.com) · MIT

- **PDF-first.** Open the PDF, crop the figure, and the crop is re-rendered at up to 600 DPI straight from the page (PDFium). Vector figures are effectively lossless.
- **Private.** No login, no cookies, no telemetry. Everything runs in the browser and works offline after first load.
- **Traceable.** Every value carries its calibration, pick points, transform, uncertainty, fit and valid range. Export a plain-JSON audit record for QA.
- **Engineer-ready.** Log axes, skew correction for scans, Y at your chosen X values, curve families with a parameter, Excel with working formulas and a chart, equations for Python / JS / Excel / VBA / MATLAB / C.

> Status: Rev 0 in development. See [docs/MILESTONES.md](docs/MILESTONES.md).

## Documentation

| | |
|---|---|
| [docs/PRD.md](docs/PRD.md) | What we are building, for whom, and what is out of scope |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Stack, package layout, workers, algorithms, CI gates |
| [docs/PROJECT_SCHEMA.md](docs/PROJECT_SCHEMA.md) | The `.cdz` project file format |
| [docs/ACCEPTANCE_TARGETS.md](docs/ACCEPTANCE_TARGETS.md) | Measurable definition of done |
| [docs/MILESTONES.md](docs/MILESTONES.md) | Work breakdown M0–M3 |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Decision log (ADRs) |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Rev 1 candidates |

## Development

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm check        # lint + typecheck + test + build
pnpm test:e2e     # Playwright
```

See [CONTRIBUTING.md](CONTRIBUTING.md). This repository is developed largely by Claude Code agent threads following [CLAUDE.md](CLAUDE.md); human and agent contributors follow the same rules.

## Report a problem

Use **Report issue** in the app header (it prefills version and browser) or open an issue here. Please attach a `.cdz` or audit JSON when you can — it contains no personal data unless you embedded the source PDF.

## License

MIT © Open Engineering Tools contributors. PDF rendering by [PDFium](https://pdfium.googlesource.com/pdfium/) (BSD-3) via [EmbedPDF](https://github.com/embedpdf/embed-pdf-viewer) (MIT).
