# `.cdz` project file and `project.json` schema

Schema version **1**. Any change to this document requires a migration function in `packages/core/src/migrations/` and a bump of `schemaVersion`.

## Container: `.cdz`

A standard zip archive (fflate, deflate level 6). Opens in any archiver.

```
my-project.cdz
├── project.json             # required — the model below
├── graphs/
│   ├── <graphId>/
│   │   ├── original.png     # the crop / image at recorded DPI, lossless
│   │   ├── render-<dpi>dpi.png  # a later re-render of a PDF crop ("Re-render at higher DPI"); `image.path` names the current one
│   │   └── thumb.jpg        # 256 px preview
├── sources/                 # optional — only when "Embed source PDF" is ticked
│   └── <sourceId>.pdf
└── README.txt               # one paragraph: what this file is, link to the app
```

Rules: `project.json` is the source of truth; images are referenced by relative path. A `.cdz` without `sources/` must still open fully (re-render is simply unavailable until the user re-attaches the PDF, matched by SHA-256 of the file bytes).

## `project.json`

```jsonc
{
  "schemaVersion": 1,
  "app": { "name": "curve-digitizer", "version": "0.3.0" },
  "id": "uuid",
  "name": "ASME VIII-2 fatigue curves",
  "created": "2026-11-02T10:12:00Z",
  "modified": "2026-11-02T11:40:00Z",
  "settings": { "units": "SI", "defaultDpi": 300, "snapRadiusPx": 8 },
  "sources": [
    { "id": "src1", "kind": "pdf", "fileName": "ASME_VIII_2.pdf", "sha256": "…", "pageCount": 1200, "embedded": false }
  ],
  "graphs": [
    {
      "id": "g1",
      "name": "Fig 3-F.1 Carbon steel",
      "source": {
        "kind": "pdfCrop",                  // or "image"
        "sourceId": "src1",
        "pageIndex": 412,                   // 0-based
        "rectPt": [72.0, 310.5, 480.2, 640.0], // x0,y0,x1,y1 in PDF points, page space, origin bottom-left
        "dpi": 400,
        "rotation": 0                       // 0 | 90 | 180 | 270
      },
      "image": { "path": "graphs/g1/original.png", "width": 2267, "height": 1830 },
      "processing": [
        { "op": "grayscale" },
        { "op": "despeckle", "radius": 1 },
        { "op": "gridSuppress", "minRunPx": 200, "tolerance": 2 },
        { "op": "contrast", "value": 1.3 }
      ],
      "calibration": {
        "xAxis": { "type": "log10", "label": "Cycles N" },
        "yAxis": { "type": "linear", "label": "Stress amplitude", "unit": "MPa" },
        "model": "affine",                  // or "projective"
        "points": [
          { "px": [102.3, 1702.1], "axis": [1, 0] },     // axis value in axis space: log10(10)=1
          { "px": [2140.8, 1703.4], "axis": [6, 0] },
          { "px": [101.9, 1700.0], "axis": [1, 0] },
          { "px": [103.0, 112.4], "axis": [1, 700] }
        ],
        "matrix": [ /* 9 numbers, row-major, px -> axis space */ ],
        "residualPx": 0.21,
        "resolution": { "xUnitsPerPx": 0.00245, "yUnitsPerPx": 0.44 },
        "warnings": []
      },
      "datasets": [
        {
          "id": "d1",
          "name": "T = 300 °C",
          "color": "#1f77b4",
          "mode": "function",               // or "path"
          "param": { "name": "Temperature", "value": 300, "unit": "°C" },
          "xUnit": "cycles", "yUnit": "MPa",
          "sourceRef": "ASME BPVC VIII-2 (2023) Fig 3-F.1",
          "notes": "",
          "points": [
            { "id": "p1", "px": [210.4, 410.2], "value": [1.25e2, 520.3], "sigma": [0.004, 0.9],
              "excludedFromFit": false, "outOfRange": false, "origin": "trace", "lineWidthPx": 3.1 }
          ]
        }
      ],
      "fits": [
        {
          "id": "f1", "datasetId": "d1", "model": "power",
          "space": { "x": "log", "y": "lin" },
          "params": { "a": 1850.2, "b": -0.1123 },
          "domain": [1.0e2, 1.0e6],
          "stats": { "n": 42, "r2": 0.9987, "rmse": 2.1, "aicc": -120.4 },
          "recommended": true
        }
      ],
      "view": { "zoom": 1.0, "pan": [0, 0] }
    }
  ],
  "history": { "op": "trace", "params": { "...": "..." } } // optional: last trace params for "re-run"
}
```

### Field notes
- `px` is always in the crop's pixel space at `source.dpi` after `rotation`. Re-rendering at a different DPI rescales all `px` by the DPI ratio (a migration-like command, undoable).
- `value` is a cache of `px` through the calibration; readers must recompute from `px` + `calibration` if they need certainty.
- `sigma` is in data units.
- Filter `op` names are a closed set in `packages/image/src/ops.ts`; unknown ops cause the file to open with a warning and the step disabled.
- `fits[].params` keys are model-specific; code generators read the model registry.

## Audit export (`*.audit.json`)
The same object as `project.json` with:
- images replaced by `{ "path", "sha256", "width", "height" }`,
- every point including its `px`, `value`, `sigma` and flags,
- a top-level `"audit": { "exportedAt", "appVersion", "userAgent" }`.

No information is removed; it is meant to be attached to a calculation report.

## Migrations
`packages/core/src/migrations/index.ts` exports `migrate(json): Project` which applies `v1 → v2 → …` in order. Each migration has a round-trip test with a fixture file under `packages/core/fixtures/schema-vN/`.
