# Calculator and comparing curves

The **Calculator** tab of the dock under the canvas reads values off every curve of the graph at once. Type one or more X values, separated by commas or spaces, and the table gives each function dataset's Y at each X. Calibrate the graph first: the calculator works in calibrated values.

## Where the values come from

- A dataset with a kept fit (see [Fitting curves](fitting.md)) answers from its fit. Outside the X range the fit was made from, the value is marked with **\*** because it is an extrapolation.
- A dataset without a fit is read along straight lines between its points, on the chart's paper: on a log axis the line is straight in log10, as drawn. Points marked **Excluded** are left out, and points at the same X are averaged. Outside its first and last point a dataset without a fit gives no value (**—**): fit it if you need a trend beyond the data.

The column header says which applies: **fit** or **points**. Path datasets (kept in pick order) are not listed, since they need not have one Y per X.

## Comparing two curves

Tick **Compare** and choose datasets **A** and **B**: two more columns give **A − B** and **A / B** at each X, for example the head margin between two pumps, or the ratio of a measured curve to a reference. The ratio is left empty where B is 0.

## Copying the results

**Copy results** puts the table on the clipboard as tab-separated text with a header row, in full precision, ready to paste into a spreadsheet. Empty cells stand for values the calculator could not give.
