# The data table

The table under the canvas lists the points of the active dataset, in calibrated units and in image pixels.

## Editing values

Focus a cell and press Enter or F2, or start typing a number. Enter keeps the edit and moves down, Tab moves right, Esc cancels. Editing a calibrated value moves the point to match.

## Excluding points

Tick **Excluded** to keep a point but leave it out of curve fits ([Fitting curves](fitting.md)). Exports still include it, flagged in an `excluded_from_fit` column. Space toggles it on a focused Excluded cell.

## Uncertainty

The **σx** and **σy** columns give each point's standard uncertainty in data units, once the graph is calibrated. It combines how precisely a point can be placed (half a pixel) with the width of the line it sits on: σ = √(0.5² + (line width / 2)²) pixels, carried through the calibration. On a log axis it grows with the value, because a pixel spans more units further up a decade.

The line width is measured from the image when a point is snapped, traced, found by the colour mask or placed by X-step, so a thick or blurred line gives a larger σ. A point placed without snap, or moved by hand, assumes a 2 pixel line. Exports carry the same values in `sigma_x` and `sigma_y`.

## Residuals

Once the dataset has a fit, the **Residual** column shows each point's distance from it: y − fit, or log10(y / fit) on a log Y axis.

## Copying

**Copy table** (or Ctrl+C) copies the selected rows, or the whole table, as tab-separated text at full precision. It pastes into Excel or a spreadsheet as columns.

## Keyboard

Arrow keys, Page Up and Page Down move between cells; Home and End go to the first or last column, and with Ctrl to the first or last cell. Space selects the row.
