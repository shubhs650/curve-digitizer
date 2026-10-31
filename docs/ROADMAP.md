# Roadmap

## Rev 0 (M1 → M3) — see `MILESTONES.md`

## Rev 1 candidates (contributions welcome after rev 0 ships)

Ordered by expected value for engineers:

1. **Vector-path extraction** — when a PDF figure is vector, snap points to the actual path objects via PDFium; near-exact data. The project schema already records page + PDF-space rect.
2. **OCR-assisted calibration** — propose tick values from axis labels; user confirms. Never silent.
3. **Markdown / PDF digitization report** — one-page provenance report for calculation appendices.
4. **Bar, date-time and polar axes.**
5. **Touch/tablet UI.**
6. **Figure auto-detection** — thumbnail every figure in a PDF.
7. **"Paste your equation"** — overlay a user formula on the digitized data.
8. **Share-by-URL** for small projects (no server).
9. **Plugin fit models.**
10. **Publish `@openengtools/curve-core`** (core + math + fit) on npm for scripted use.

## Explicitly not planned
Cloud sync, accounts, telemetry, ML tracing that cannot run deterministically in-browser.
