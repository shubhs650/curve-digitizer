# Roadmap

Curve Digitizer 0.3.0 completes rev 0: PDF and image input, calibration, manual points with snap, the guided trace, colour mask and X-step tools, pre-processing, the data table, curve fitting with code export, the calculator, the reference overlay and the exports. Everything runs in your browser and works offline.

## Rev 1 candidates

These are ideas for after rev 0, ordered by how much we expect they help engineers. None is promised or scheduled; contributions are welcome. Open an issue on GitHub to discuss one before starting on it.

1. **Vector-path extraction.** When a PDF figure is vector artwork, snap points to the actual path objects for near-exact data. Projects already record the page and the PDF-space rectangle of each crop, so this can be added later.
2. **OCR-assisted calibration.** Propose tick values read from the axis labels; you confirm each one. Never applied silently.
3. **Digitization report.** A one-page Markdown or PDF provenance report for calculation appendices.
4. **Bar, date-time and polar axes.**
5. **Touch and tablet use.**
6. **Figure detection.** Thumbnails of every figure in a PDF to pick from.
7. **"Paste your equation".** Overlay a formula you type on the digitized data.
8. **Share by URL** for small projects, with no server involved.
9. **Plugin fit models.**
10. **A scripting package** of the core, maths and fitting code on npm.

## Not planned

Cloud sync, accounts, telemetry, and machine-learning tracing that cannot run deterministically in the browser. Your files stay on your device.
