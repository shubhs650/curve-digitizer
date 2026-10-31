# PDFs and images

## Opening files

- **Open PDF or image…** on the home screen, or **Add PDF or image…** in the sidebar of an open project.
- Drop files anywhere on the window.
- Paste an image with Ctrl+V (for example a screenshot).
- In the installed app, open a `.cdz`, PNG, JPEG or WebP file from your file manager.

Opening a file on the home screen starts a new project. Opening one with a project open adds it to that project.

Password-protected PDFs ask for the password. It is used only to open the file in this tab and is never stored.

## Cropping a PDF page

1. Under **PDFs** in the sidebar, click the page that holds the graph.
2. Drag a rectangle around the graph, including the axis labels. **Whole page** selects the page.
3. If the page is sideways, use **Rotate left** or **Rotate right** until the graph reads normally.
4. Pick a **Resolution**. 300 DPI suits most scanned and vector figures; choose more for fine detail.
5. Choose **Crop to new graph**.

Very large crops are capped so the image fits in memory; the panel says when that happens.

## Re-rendering at a higher resolution

The **Source** panel of a graph cropped from a PDF offers **Re-render at** a higher DPI. Calibration clicks and points move with the image, so nothing has to be redone. The PDF must still be stored with the project, or be opened again.

## Comparing with a reference image

To compare a graph with another crop or another edition of the same figure, lay a second image over it:

- From an image file: in the inspector's **Reference overlay** section, choose **Load reference image…**.
- From a PDF page: with the graph selected, open the page, drag a rectangle and choose **Use as reference for** the graph, instead of **Crop to new graph**.

The reference starts half see-through at the image's top-left corner. Set its **Opacity**, move it with **Offset X** and **Offset Y** (in image pixels) until the two line up, and turn it off with **Show reference**. It is drawn at the same pixel size as the graph, so crop both at the same resolution.

The reference is a viewing aid only: it is not saved with the project and is gone when the page is reloaded.

## Images

PNG, JPEG and WebP images become graphs as they are. A photo of a page taken at an angle can still be calibrated: turn on **Projective** in the calibration panel.
