# Digitizing points

## Datasets

A dataset is one curve. Add one with **Add dataset** in the **Datasets** panel, give it a name and a colour, and pick it as the dataset new points go into. For a family of curves (for example one curve per temperature), turn on **Family parameter** and enter the parameter's name, value and unit.

## Adding points

Press **P** for the add points tool and click on the curve. With **Magnetic snap** on (S), each point moves onto the centre of the nearby line; set the snap radius in the **Points** panel of the inspector. The **Loupe** (L) magnifies the area under the pointer.

Without a mouse, focus the canvas and press **Enter** to show the keyboard crosshair. Move it with the arrow keys (Shift for 10 pixels) and press **Enter** again to click with the current tool. **Esc** hides it.

## Guided trace

The guided tracer follows one curve and places points along it. It goes straight through crossings, ignores grid lines and other colours, and bridges small gaps such as dashes.

1. Press **T** for the guided trace tool (or **Guided trace (T)** in the inspector) and click on the curve where the trace should start. The colour under the click becomes the curve colour.
2. Click where the trace should stop, or press **Trace to the curve ends** in the **Guided trace** panel to follow the curve both ways to its ends. A progress bar shows while it runs; **Cancel** stops it.
3. Where the curve splits and the tracer cannot tell which way it goes, it stops and draws numbered branches on the canvas. Click a number (or **Follow branch 1**, **2** … in the panel) to go on, or **Stop here**.
4. Set **Point spacing** for how densely points are placed; the count updates as you change it. **Use for** *dataset* sets the active dataset's colour to the curve colour.
5. Press **Add points** to add the points to the active dataset (or to a new dataset in the curve colour). This is one step to undo. **Esc** or **Clear** discards the trace.

The tracer reads the [pre-processed](preprocessing.md) image.

## Colour mask

The colour mask finds every curve of one colour at once, which suits clean charts where each curve has its own colour.

1. Press **M** for the colour mask tool (or **Colour mask (M)** in the inspector) and click on a curve. The colour under the click becomes the curve colour.
2. The **Colour mask** panel lists the curves of that colour, longest first. The curve you clicked is kept: it is drawn solid blue on the canvas, and the others are dashed grey. Click a curve on the canvas, or tick it in the list, to keep or drop it.
3. Move **Colour tolerance** to take in more or fewer shades. A higher value picks up anti-aliased edges and faded scans; a lower one keeps similar colours apart.
4. Press **Add points** to add points along the kept curves to the active dataset (or to a new dataset in the curve colour). This is one step to undo.

The mask reads the [pre-processed](preprocessing.md) image. Where another curve is drawn over this one, or a line is dashed, the pieces are joined across gaps of up to 16 pixels. When two curves of the same colour cross, use the guided tracer instead.

## X-step

X-step places one point on a curve at each X value you ask for, such as every 5 m³/h, so the dataset lines up with a table or with other curves. The graph must be calibrated first, and the active dataset must be a function dataset (a path dataset has no single Y for each X).

1. In the **X-step** panel choose **Every step** and enter **From**, **To** and **Step** (left empty, they take a round range across the image), or choose **List** and type the X values separated by commas, spaces or new lines. The panel counts the X values, in the X axis unit.
2. Press **X** for the X-step tool (or **X-step (X)** in the panel) and click the curve.
3. The tool traces the curve as the guided tracer does and reads the point where it crosses each X. The points are drawn on the canvas. A point that jumps away from its neighbours is an outlier: it is drawn red with a cross, and is added excluded from fits so you can check it and move it with the select tool. X values the curve does not reach are listed and skipped.
4. Press **Add points** to add them to the active dataset (or to a new dataset in the curve colour). This is one step to undo. Esc or **Clear** discards the result.

On log axes the X values are read on the log scale, so a list such as 1, 10, 100 lands on the decades.

## Selecting and editing points

With the select tool (V):

- Click a point to select it; Shift+click or Ctrl+click adds to or removes from the selection; drag on empty canvas to select an area.
- Drag selected points to move them, or nudge them with the arrow keys (Shift for 0.1 pixel).
- Delete or Backspace deletes the selection; Ctrl+A selects every point of the graph.

## Zooming and panning

Use the mouse wheel or + and − to zoom, 0 to fit the image and 1 for actual size. Ctrl+wheel, pinch, Ctrl + and Ctrl − also zoom the graph rather than the whole app, and Ctrl 0 fits it. Pan with the pan tool (H), Space+drag, the middle mouse button, or the arrow keys when nothing is selected.

Every change can be undone with Ctrl+Z and redone with Ctrl+Y.
