# Exporting

Choose **Export** in the sidebar.

| Format | Contains |
|---|---|
| CSV, long | The shown graph: one row per point, with its dataset, family parameter and an excluded-from-fit flag. |
| CSV, wide | The shown graph: one X column and one Y column per dataset, empty where a dataset has no point at that X. |
| Excel workbook | Every calibrated graph, one sheet each, plus the project details. |
| Audit JSON | The provenance of every number: source file, crop, calibration and points. |

CSV and Excel exports need a calibrated graph. Values are written at full precision; round them in your spreadsheet if you need to. CSV files start with `#` comment lines saying where the numbers came from.

Files are created in the browser and downloaded directly.
