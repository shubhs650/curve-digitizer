# Digitizing points

## Datasets

A dataset is one curve. Add one with **Add dataset** in the **Datasets** panel, give it a name and a colour, and pick it as the dataset new points go into. For a family of curves (for example one curve per temperature), turn on **Family parameter** and enter the parameter's name, value and unit.

## Adding points

Press **P** for the add points tool and click on the curve. With **Magnetic snap** on (S), each point moves onto the centre of the nearby line; set the snap radius in the **Points** panel of the inspector. The **Loupe** (L) magnifies the area under the pointer.

Without a mouse, focus the canvas and press **Enter** to show the keyboard crosshair. Move it with the arrow keys (Shift for 10 pixels) and press **Enter** again to click with the current tool. **Esc** hides it.

## Colour mask

The colour mask finds every curve of one colour at once, which suits clean charts where each curve has its own colour.

1. Press **M** for the colour mask tool (or **Colour mask (M)** in the inspector) and click on a curve. The colour under the click becomes the curve colour.
2. The **Colour mask** panel lists the curves of that colour, longest first. The curve you clicked is kept: it is drawn solid blue on the canvas, and the others are dashed grey. Click a curve on the canvas, or tick it in the list, to keep or drop it.
3. Move **Colour tolerance** to take in more or fewer shades. A higher value picks up anti-aliased edges and faded scans; a lower one keeps similar colours apart.
4. Press **Add points** to add points along the kept curves to the active dataset (or to a new dataset in the curve colour). This is one step to undo.

The mask reads the [pre-processed](preprocessing.md) image. Where another curve is drawn over this one, or a line is dashed, the pieces are joined across gaps of up to 16 pixels. When two curves of the same colour cross, use the guided tracer instead.

## Selecting and editing points

With the select tool (V):

- Click a point to select it; Shift+click or Ctrl+click adds to or removes from the selection; drag on empty canvas to select an area.
- Drag selected points to move them, or nudge them with the arrow keys (Shift for 0.1 pixel).
- Delete or Backspace deletes the selection; Ctrl+A selects every point of the graph.

## Zooming and panning

Use the mouse wheel or + and − to zoom, 0 to fit the image and 1 for actual size. Pan with the pan tool (H), Space+drag, the middle mouse button, or the arrow keys when nothing is selected.

Every change can be undone with Ctrl+Z and redone with Ctrl+Y.
