# Fitting curves

The **Fit** tab of the dock under the canvas fits an equation to the active dataset. Fits are made on calibrated values, so calibrate the graph first; the dataset must be a function dataset (one Y per X) with at least three points that are not excluded.

## Recommend fits

**Recommend fits** tries every model and ranks them by AICc, a score that rewards a close fit but charges for each extra coefficient, so a 9th-degree polynomial does not win just by wiggling through the noise. Three candidates are listed:

- the **Recommended** one: the simplest model whose AICc is within 10 of the best, the simplest equation the points do not rule out;
- then the lowest-AICc others, each with R², RMSE and ΔAICc (how far behind the best it is).

Click a candidate to preview it: it is drawn dashed over the image and its residuals (point minus fit) are plotted beside the list. **Use this fit** keeps it for the dataset and draws it solid; **Discard** drops the candidates. A kept fit can be undone like any other change, and **Remove fit** takes it away.

A candidate marked **Oscillates** swings well away from the points between them, typically a high-degree polynomial across a gap in the data; prefer another model.

## Choosing a model yourself

Pick a model and press **Fit model**:

| Model | Equation | Option |
|---|---|---|
| Polynomial | y = c₀ + c₁x + … + c_d x^d | degree 1–9 |
| Power law | y = a·x^b | |
| Exponential | y = a·e^(b·x) | |
| Logarithmic | y = a + b·ln x | |
| Rational | y = (p₀ + p₁x + …)/(1 + q₁x + …) | order, e.g. 2/1 |
| Cubic spline | natural cubic spline through fitted knot values | knot count, or auto |
| Monotone spline (PCHIP) | piecewise cubic that never overshoots between knots | knot count, or auto |
| Piecewise linear | straight segments joined at breakpoints | x values of the breakpoints, or auto |

## Log axes

On a log axis the fit is made on the log of the values, as the chart shows them: a power law on log–log paper is a straight line, an exponential on a log Y axis is a straight line. Polynomials, splines and piecewise lines are then shapes on the log paper, for example log10 y = c₀ + c₁·log10 x + c₂·(log10 x)². RMSE and the residuals are in log10 units on a log Y axis.

## Excluded points and residuals

Points marked **Excluded** in the table are left out of every fit; the residual plot shows them as hollow circles so you can see how far off they are. Once a dataset has a fit, the table's **Residual** column gives each point's distance from it (y − fit, or log10(y / fit) on a log Y axis).

If points are added, removed or excluded after a fit was kept, the panel says so: fit again to update it.

## Range

Every fit records the X range of the points it was made from. The curve is drawn over that range only; outside it a fit is an extrapolation.
