# Exporting

Choose **Export** in the sidebar.

| Format | Contains |
|---|---|
| CSV, long | The shown graph: one row per point, with its dataset, family parameter, uncertainty (`sigma_x`, `sigma_y`) and an excluded-from-fit flag. |
| CSV, wide | The shown graph: one X column and one Y column per dataset, empty where a dataset has no point at that X. |
| Excel workbook | Every calibrated graph, one sheet each with the same columns as the long CSV, a chart and the graph image; your fits as live formulas and VBA functions; and the project details. |
| Audit JSON | The provenance of every number: source file, crop, calibration and points. |

CSV and Excel exports need a calibrated graph. Values are written at full precision; round them in your spreadsheet if you need to. CSV files start with `#` comment lines saying where the numbers came from.

Points of a function dataset that share exactly the same X are written as one row with their mean Y; its uncertainty is that of the mean, but never smaller than the half-pixel resolution of one point. See [the data table](data-table.md) for how the uncertainty is worked out.

## The Excel workbook

- **Data** (one sheet per calibrated graph, named after it when there are several): the points as in the long CSV. To the right, a chart of the points and each kept fit on the graph's axes (log axes stay log), and below it the graph image the points were digitised from.
- **Fit** (when any dataset has a kept fit): for each fit, its model, valid range and statistics; its parameters in cells with workbook names, such as `pump_a_c` for the coefficients of a polynomial for "Pump A"; and 50 rows of x across the valid range with a formula for y that reads those names. Type another x in column A, or change a parameter, and the values and the chart follow. Polynomials, power, exponential, logarithmic and rational fits work in any Excel. Splines and piecewise lines use `LET`, which needs Excel 2021 or Microsoft 365 (or LibreOffice 24.8 or later).
- **VBA**: each fit as a VBA function, the same code as **Code** in the Fit tab. Copy one into a module (Alt+F11, then Insert > Module) to use it in any cell like a built-in function, in any Excel. The workbook itself has no macros.
- **Project**: where every number came from (source, calibration, datasets) and a summary of each fit.

The workbook asks Excel to recalculate when it opens, so the formulas, not stored copies of their results, give the values you see.

Files are created in the browser and downloaded directly.
